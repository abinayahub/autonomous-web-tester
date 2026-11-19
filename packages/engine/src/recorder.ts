/**
 * Persistence for one run: pages, elements, test cases, issues (grouped + de-duplicated), screenshots and progress events.
 * Every CONFIRMED issue must carry a screenshot and measured signals (evidence contract) — otherwise it is downgraded
 * to NEEDS_REVIEW rather than stored as a confirmed bug.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DeviceClass, FindingClassification, Prisma, PrismaClient, Severity, TestModule, TestStatus } from '@awt/db';
import type { Locator, Page } from 'playwright';

export interface IssueInput {
  module: TestModule;
  category: string;
  title: string;
  description: string;
  severity: Severity;
  classification: FindingClassification;
  expected: string;
  actual: string;
  steps: string[];
  pageUrl: string;
  pageId?: string;
  elementId?: string;
  testCaseId?: string;
  viewportId?: string;
  deviceClass?: DeviceClass;
  /** Measured values that prove the finding. */
  signals: Record<string, unknown>;
  /** Grouping key: the same key in one run updates the existing issue (adds the affected page) instead of duplicating it. */
  groupKey: string;
  /** Screenshot artifact ids. */
  evidence: string[];
  recommendation: string;
  /** Human description of the affected element (for reports). */
  elementLabel?: string;
  pageName?: string;
}

export interface Shot {
  artifactId: string;
  storagePath: string;
}

export class Recorder {
  private seq = 0;
  private issueSeq = 0;
  private readonly groups = new Map<string, { id: string; pages: Set<string>; input: IssueInput }>();
  readonly counts = { tests: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, confirmed: 0, review: 0 };
  readonly recommendations = new Map<string, string>();

  constructor(
    private readonly db: PrismaClient,
    readonly runId: string,
    readonly projectId: string,
    private readonly storageRoot: string,
  ) {}

  // ── progress ──
  async event(type: string, message: string, data?: Prisma.InputJsonValue, level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' = 'INFO') {
    await this.db.runEvent.create({ data: { runId: this.runId, type, message: message.slice(0, 1000), data, level } }).catch(() => undefined);
  }

  // ── pages & elements ──
  async upsertPage(p: { url: string; normalizedUrl: string; title?: string; pageName?: string; statusCode?: number; depth: number; discoveredFromId?: string; source: Prisma.PageCreateInput['discoverySource']; requiresAuth?: boolean; isSpaRoute?: boolean; loadTimeMs?: number; domHash?: string }) {
    const data = {
      url: p.url, title: p.title?.slice(0, 300), pageName: p.pageName?.slice(0, 200), statusCode: p.statusCode, depth: p.depth,
      discoveredFromId: p.discoveredFromId, discoverySource: p.source, requiresAuth: p.requiresAuth ?? false, isSpaRoute: p.isSpaRoute ?? false,
      loadTimeMs: p.loadTimeMs, domHash: p.domHash,
    };
    return this.db.page.upsert({
      where: { runId_normalizedUrl: { runId: this.runId, normalizedUrl: p.normalizedUrl } },
      create: { runId: this.runId, normalizedUrl: p.normalizedUrl, ...data },
      // requiresAuth is set only on creation: a page first found anonymously stays public.
      update: { title: data.title, statusCode: data.statusCode, loadTimeMs: data.loadTimeMs, domHash: data.domHash },
    });
  }

  async element(pageId: string, e: { elementType: string; selector: string; role?: string; accessibleName?: string; text?: string; attributes?: Prisma.InputJsonValue; boundingBox?: Prisma.InputJsonValue; risk?: 'SAFE' | 'MUTATING' | 'DESTRUCTIVE' | 'UNKNOWN'; riskReason?: string }) {
    return this.db.element.create({
      data: { pageId, elementType: e.elementType, selector: e.selector.slice(0, 1000), role: e.role, accessibleName: e.accessibleName?.slice(0, 300), text: e.text?.slice(0, 300), attributes: e.attributes, boundingBox: e.boundingBox, risk: e.risk ?? 'UNKNOWN', riskReason: e.riskReason },
    });
  }

  // ── test cases ──
  async testCase(t: { module: TestModule; name: string; status: TestStatus; pageId?: string; elementId?: string; viewportId?: string; deviceClass?: DeviceClass; inputData?: Prisma.InputJsonValue; observations?: Prisma.InputJsonValue; errorMessage?: string; durationMs?: number; attempts?: number }) {
    this.counts.tests++;
    if (t.status === 'PASSED') this.counts.passed++;
    else if (t.status === 'FAILED') this.counts.failed++;
    else if (t.status === 'FLAKY') this.counts.flaky++;
    else this.counts.skipped++;
    return this.db.testCase.create({
      data: { runId: this.runId, module: t.module, name: t.name.slice(0, 300), status: t.status, pageId: t.pageId, elementId: t.elementId, viewportId: t.viewportId, deviceClass: t.deviceClass, inputData: t.inputData, observations: t.observations, errorMessage: t.errorMessage?.slice(0, 2000), durationMs: t.durationMs, attempts: t.attempts ?? 1 },
    });
  }

  // ── screenshots ──
  /**
   * Captures the viewport (or a region around `target`) with the target outlined in red and labelled.
   * Password fields are always masked.
   */
  async screenshot(page: Page, opts: { label: string; target?: Locator; pageId?: string; testCaseId?: string; fullPage?: boolean; viewportId?: string }): Promise<Shot | undefined> {
    const n = ++this.seq;
    const rel = join('runs', this.runId, `${String(n).padStart(4, '0')}-${opts.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.png`).replace(/\\/g, '/');
    let box: { x: number; y: number; width: number; height: number } | null = null;
    try {
      if (opts.target) {
        await opts.target.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
        box = await opts.target.boundingBox({ timeout: 2_000 }).catch(() => null);
        if (box) {
          // Plain-JS string so no build helpers leak into the page.
          await page.evaluate(`(() => {
            const b = ${JSON.stringify(box)}, label = ${JSON.stringify(opts.label.slice(0, 80))};
            const o = document.createElement('div');
            o.id = '__awt_highlight';
            o.style.cssText = 'position:absolute;left:' + (b.x + scrollX - 4) + 'px;top:' + (b.y + scrollY - 4) + 'px;width:' + (b.width + 8) + 'px;height:' + (b.height + 8) + 'px;border:3px solid #e5341d;border-radius:6px;box-shadow:0 0 0 4000px rgba(0,0,0,.08);z-index:2147483647;pointer-events:none;';
            const t = document.createElement('div');
            t.textContent = label;
            t.style.cssText = 'position:absolute;left:-3px;top:-24px;background:#e5341d;color:#fff;font:600 12px/1.6 system-ui,sans-serif;padding:0 6px;border-radius:4px;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis;';
            o.appendChild(t);
            document.body.appendChild(o);
          })()`);
        }
      }
      const vp = page.viewportSize();
      const clip = box && vp && !opts.fullPage
        ? (() => {
            // A readable region around the element: full viewport width, element ± context.
            const top = Math.max(0, box.y - 160);
            const height = Math.min(Math.max(box.height + 320, 360), 1400);
            return { x: 0, y: top, width: vp.width, height: Math.min(height, Math.max(1, vp.height - top)) };
          })()
        : undefined;
      const buf = await page.screenshot({
        fullPage: !!opts.fullPage,
        clip: clip && clip.height > 40 ? clip : undefined,
        mask: [page.locator('input[type=password]')],
        maskColor: '#888',
        animations: 'disabled',
        timeout: 10_000,
      });
      const full = join(this.storageRoot, rel);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, buf);
      const a = await this.db.artifact.create({
        data: {
          runId: this.runId, pageId: opts.pageId, testCaseId: opts.testCaseId, type: opts.target ? 'ELEMENT_SCREENSHOT' : 'PAGE_SCREENSHOT',
          storagePath: rel, mimeType: 'image/png', sizeBytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'),
          metadata: { label: opts.label, viewport: vp, viewportId: opts.viewportId, highlight: box, pageUrl: page.url(), maskedSelectors: ['input[type=password]'] },
        },
      });
      return { artifactId: a.id, storagePath: rel };
    } catch {
      return undefined;
    } finally {
      if (box) await page.evaluate("document.getElementById('__awt_highlight')?.remove()").catch(() => undefined);
    }
  }

  // ── issues ──
  private describe(i: IssueInput, pages: string[]) {
    const also = pages.length > 1
      ? `\n\nAlso seen on ${pages.length - 1} other page${pages.length > 2 ? 's' : ''}:\n${pages.slice(1, 21).map((p) => `• ${p}`).join('\n')}${pages.length > 21 ? `\n• … and ${pages.length - 21} more` : ''}`
      : '';
    return `${i.description}${also}\n\nRecommended fix: ${i.recommendation}`;
  }

  private fingerprint(i: IssueInput) {
    return createHash('sha1').update(`${i.module}|${i.category}|${i.groupKey}`).digest('hex');
  }

  /** Stores (or groups) a finding. Returns the issue id. */
  async issue(input: IssueInput): Promise<string | undefined> {
    let i = { ...input };
    if (i.classification === 'CONFIRMED' && (!i.evidence.length || Object.keys(i.signals).length === 0)) {
      // Evidence contract: never store an unproven confirmed bug.
      i = { ...i, classification: 'NEEDS_REVIEW', description: `${i.description}\n\n(Downgraded to "needs review": screenshot evidence could not be captured.)` };
    }
    const fp = this.fingerprint(i);
    const existing = this.groups.get(fp);
    if (existing) {
      if (!existing.pages.has(i.pageUrl)) {
        existing.pages.add(i.pageUrl);
        const pages = [...existing.pages];
        await this.db.issue.update({ where: { id: existing.id }, data: { description: this.describe(existing.input, pages) } });
      }
      if (i.evidence.length) await this.db.artifact.updateMany({ where: { id: { in: i.evidence.slice(0, 2) }, issueId: null }, data: { issueId: existing.id } });
      return existing.id;
    }
    this.issueSeq++;
    const key = `AWT-${this.runId.slice(0, 6).toUpperCase()}-${String(this.issueSeq).padStart(3, '0')}`;
    const created = await this.db.issue.create({
      data: {
        issueKey: key, runId: this.runId, projectId: this.projectId, pageId: i.pageId, testCaseId: i.testCaseId, elementId: i.elementId,
        classification: i.classification, module: i.module, category: i.category, title: i.title.slice(0, 300), description: this.describe(i, [i.pageUrl]),
        severity: i.severity, expectedResult: i.expected, actualResult: i.actual, stepsToReproduce: i.steps, pageName: i.pageName,
        pageUrl: i.pageUrl, viewportId: i.viewportId, deviceClass: i.deviceClass, browser: 'chromium', fingerprint: fp,
      },
    });
    if (i.evidence.length) await this.db.artifact.updateMany({ where: { id: { in: i.evidence } }, data: { issueId: created.id } });
    this.groups.set(fp, { id: created.id, pages: new Set([i.pageUrl]), input: i });
    this.recommendations.set(created.id, i.recommendation);
    if (i.classification === 'CONFIRMED') this.counts.confirmed++;
    else this.counts.review++;
    await this.event('issue.found', `${i.classification === 'CONFIRMED' ? 'Issue' : 'Needs review'}: ${i.title}`, { issueId: created.id, key, severity: i.severity, module: i.module }, i.classification === 'CONFIRMED' ? 'WARN' : 'INFO');
    return created.id;
  }

  /** Stores the measured signals of each issue next to it (in the linked test case) for the report. */
  signalsOf(issueId: string) {
    for (const g of this.groups.values()) if (g.id === issueId) return { signals: g.input.signals, pages: [...g.pages], element: g.input.elementLabel };
    return undefined;
  }
}
