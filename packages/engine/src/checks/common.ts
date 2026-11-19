import type { BrowserContext, Locator, Page } from 'playwright';
import type { DeviceClass, FindingClassification, Severity, TestModule } from '@awt/db';
import { gotoAndSettle, monitorPage } from '../browser.js';
import type { CrawledPage, RunCtx } from '../types.js';
import { pathOf } from '../url.js';

export async function openPage(bctx: BrowserContext, url: string) {
  const page = await bctx.newPage();
  const signals = monitorPage(page);
  const nav = await gotoAndSettle(page, url);
  return { page, signals, nav };
}

export interface Finding {
  module: TestModule;
  category: string;
  title: string;
  severity: Severity;
  classification: FindingClassification;
  description: string;
  expected: string;
  actual: string;
  steps: string[];
  signals: Record<string, unknown>;
  groupKey: string;
  recommendation: string;
  testName: string;
  pageRec: Pick<CrawledPage, 'id' | 'url' | 'title'>;
  /** Screenshot target. When omitted the visible page is captured. */
  page?: Page;
  target?: Locator;
  shotLabel?: string;
  /** Extra screenshots already captured (e.g. the destination of a broken link). */
  extraShots?: string[];
  element?: { type: string; selector: string; text?: string; risk?: 'SAFE' | 'MUTATING' | 'DESTRUCTIVE' | 'UNKNOWN' };
  viewportId?: string;
  deviceClass?: DeviceClass;
  inputData?: Record<string, unknown>;
}

const STATUS = { CONFIRMED: 'FAILED', FLAKY: 'FLAKY', NEEDS_REVIEW: 'BLOCKED' } as const;

/** Test case (with signals) + screenshot + issue, in that order. */
export async function report(ctx: RunCtx, f: Finding): Promise<string | undefined> {
  const el = f.element ? await ctx.rec.element(f.pageRec.id, { elementType: f.element.type, selector: f.element.selector, text: f.element.text, accessibleName: f.element.text, risk: f.element.risk }) : undefined;
  const tc = await ctx.rec.testCase({
    module: f.module, name: f.testName, status: STATUS[f.classification], pageId: f.pageRec.id, elementId: el?.id,
    viewportId: f.viewportId, deviceClass: f.deviceClass, inputData: f.inputData as never, observations: { ...f.signals, classification: f.classification, severity: f.severity } as never,
  });
  const shots: string[] = [];
  if (f.page) {
    const s = await ctx.rec.screenshot(f.page, { label: f.shotLabel ?? f.title, target: f.target, pageId: f.pageRec.id, testCaseId: tc.id, viewportId: f.viewportId });
    if (s) shots.push(s.artifactId);
  }
  shots.push(...(f.extraShots ?? []));
  return ctx.rec.issue({
    module: f.module, category: f.category, title: f.title, description: f.description, severity: f.severity, classification: f.classification,
    expected: f.expected, actual: f.actual, steps: f.steps, pageUrl: f.pageRec.url, pageId: f.pageRec.id, elementId: el?.id, testCaseId: tc.id,
    viewportId: f.viewportId, deviceClass: f.deviceClass, signals: f.signals, groupKey: f.groupKey, evidence: shots, recommendation: f.recommendation,
    elementLabel: f.element ? `${f.element.type} "${f.element.text ?? ''}" (${f.element.selector})` : undefined, pageName: f.pageRec.title || pathOf(f.pageRec.url),
  });
}

export async function pass(ctx: RunCtx, t: { module: TestModule; name: string; pageId?: string; observations?: Record<string, unknown>; viewportId?: string; deviceClass?: DeviceClass; status?: 'PASSED' | 'SKIPPED' | 'BLOCKED' | 'ERROR'; error?: string; inputData?: Record<string, unknown> }) {
  await ctx.rec.testCase({ module: t.module, name: t.name, status: t.status ?? 'PASSED', pageId: t.pageId, observations: t.observations as never, viewportId: t.viewportId, deviceClass: t.deviceClass, errorMessage: t.error, inputData: t.inputData as never });
}

export const quote = (s: string, n = 60) => `"${s.replace(/\s+/g, ' ').trim().slice(0, n)}${s.length > n ? '…' : ''}"`;

export const SOFT_404 = /\b404\b|page not found|not found|page (does not|doesn't|could not be|can't be) (exist|found)|no longer (exists|available)/i;
