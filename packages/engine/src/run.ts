import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { checkUrlSafety, credentialAad, decryptSecret, type KeyRing } from '@awt/crypto';
import type { PrismaClient, TestModule } from '@awt/db';
import { DEFAULT_VIEWPORTS, TestModule as ALL_MODULES } from '@awt/shared';
import { login } from './auth.js';
import { GuardedBrowser, type Environment } from './browser.js';
import { BrowserLaunchError } from './launch.js';
import { checkButtons } from './checks/buttons.js';
import { checkForms } from './checks/forms.js';
import { checkLayout } from './checks/layout.js';
import { checkNavigation } from './checks/navigation.js';
import { checkTechnical } from './checks/technical.js';
import { crawl, newPageContext, probe } from './crawl.js';
import { Recorder } from './recorder.js';
import { generateReport } from './report.js';
import type { CrawledPage, RunCtx, RunSettings, Stage, TestCredential } from './types.js';
import { normalizeUrl, pathOf } from './url.js';

/** A problem with the target itself (unreachable, unsafe, invalid certificate). Retrying will not help. */
export class TargetError extends Error {
  readonly permanent = true;
}
class Cancelled extends Error {}

export interface ExecuteOptions {
  runId: string;
  signal: AbortSignal;
  log: (m: string) => void;
  storageRoot: string;
  keyRing?: KeyRing;
  /** Exact "host:port" entries that may be private (development fixtures). */
  allowPrivate?: string[];
  timeLimitMs?: number;
}

export interface RunSummary {
  pages: number;
  tests: number;
  passed: number;
  failed: number;
  confirmedIssues: number;
  needsReview: number;
  reportId?: string;
  partial: boolean;
}

interface Snapshot { modules?: string[]; viewports?: string[]; maxPages?: number; maxDepth?: number; timeLimitMinutes?: number }

const DEFAULT_VP = ['desktop-1280', 'tablet-768', 'mobile-375'];

/** Runs one complete test of a website. All results are written to the database as they are produced. */
export async function executeTestRun(db: PrismaClient, o: ExecuteOptions): Promise<RunSummary> {
  const run = await db.testRun.findUniqueOrThrow({ where: { id: o.runId }, include: { project: { include: { credentials: true } } } });
  const snap = (run.configSnapshot ?? {}) as Snapshot;
  const project = run.project;

  // A retried attempt starts clean so nothing is recorded twice.
  await db.$transaction([
    db.issue.deleteMany({ where: { runId: run.id } }),
    db.artifact.deleteMany({ where: { runId: run.id } }),
    db.testCase.deleteMany({ where: { runId: run.id } }),
    db.page.deleteMany({ where: { runId: run.id } }),
    db.report.deleteMany({ where: { runId: run.id } }),
    // Counters must match the (now empty) rows, or a retry that fails early would show the previous attempt's totals.
    db.testRun.update({ where: { id: run.id }, data: { pagesDiscovered: 0, testsTotal: 0, testsPassed: 0, testsFailed: 0, testsFlaky: 0, confirmedIssues: 0, reviewItems: 0 } }),
  ]);
  await rm(join(o.storageRoot, 'runs', run.id), { recursive: true, force: true }).catch(() => undefined);

  const credentials: TestCredential[] = [];
  for (const c of project.credentials.slice(0, 3)) {
    if (!o.keyRing) break;
    try {
      credentials.push({
        role: c.roleName, loginUrl: c.loginUrl ?? undefined, successIndicator: ((c.loginConfig ?? {}) as { successIndicator?: string }).successIndicator || undefined,
        username: decryptSecret(o.keyRing, { ciphertext: Buffer.from(c.usernameEnc), iv: Buffer.from(c.usernameIv), authTag: Buffer.from(c.usernameTag), keyVersion: c.keyVersion }, credentialAad(project.id, c.roleName, 'username')),
        password: decryptSecret(o.keyRing, { ciphertext: Buffer.from(c.passwordEnc), iv: Buffer.from(c.passwordIv), authTag: Buffer.from(c.passwordTag), keyVersion: c.keyVersion }, credentialAad(project.id, c.roleName, 'password')),
      });
    } catch {
      o.log(`credential "${c.roleName}" could not be decrypted — skipped`);
    }
  }

  const modules = new Set(((snap.modules?.length ? snap.modules : ALL_MODULES) as string[]).filter((m): m is TestModule => (ALL_MODULES as readonly string[]).includes(m)));
  const vpIds = snap.viewports?.length ? snap.viewports : DEFAULT_VP;
  const s: RunSettings = {
    runId: run.id, projectId: project.id, projectName: project.name, baseUrl: project.baseUrl,
    allowedHosts: project.allowedDomains.length ? project.allowedDomains : [new URL(project.baseUrl).hostname],
    excludedPaths: project.excludedPaths, environment: project.environment as Environment,
    maxPages: Math.max(1, Math.min(snap.maxPages ?? project.maxPages, 300)), maxDepth: Math.max(0, Math.min(snap.maxDepth ?? project.maxDepth, 10)),
    modules, viewports: DEFAULT_VIEWPORTS.filter((v) => vpIds.includes(v.id)), timeLimitMs: o.timeLimitMs ?? (snap.timeLimitMinutes ?? 25) * 60_000,
    rps: Math.max(1, project.rateLimitRps), storageRoot: o.storageRoot, network: { allowPrivate: o.allowPrivate ?? [] }, credentials,
    interactionPageLimit: 25,
  };
  if (!s.viewports.length) s.viewports = DEFAULT_VIEWPORTS.filter((v) => DEFAULT_VP.includes(v.id));

  const rec = new Recorder(db, run.id, project.id, o.storageRoot);
  const gb = new GuardedBrowser({ allowedHosts: s.allowedHosts, environment: s.environment, network: s.network, rps: s.rps, userAgent: undefined });
  const started = Date.now();
  const ctx: RunCtx = {
    s, rec, gb, signal: o.signal, log: o.log, deadline: started + s.timeLimitMs, pages: [], sessions: new Map(),
    checkpoint: () => {
      if (o.signal.aborted) throw new Cancelled('Run cancelled');
    },
    timeLeft: () => started + s.timeLimitMs - Date.now(),
    stage: async (stage: Stage, message: string, data?: Record<string, unknown>) => {
      o.log(`[${stage}] ${message}`);
      await rec.event(`stage.${stage}`, message, { stage, ...data } as never);
    },
  };
  const notes: string[] = [];
  const counters = async () => {
    await db.testRun.update({
      where: { id: run.id },
      data: {
        pagesDiscovered: await db.page.count({ where: { runId: run.id } }), testsTotal: rec.counts.tests, testsPassed: rec.counts.passed,
        testsFailed: rec.counts.failed, testsFlaky: rec.counts.flaky, confirmedIssues: rec.counts.confirmed, reviewItems: rec.counts.review,
      },
    });
  };
  const step = async (name: Stage, enabled: boolean, fn: () => Promise<void>) => {
    if (!enabled) return;
    ctx.checkpoint();
    if (ctx.timeLeft() < 45_000) {
      notes.push(`Time limit reached — the "${name}" stage did not run.`);
      return;
    }
    try {
      await fn();
    } catch (e) {
      if (e instanceof Cancelled || o.signal.aborted) throw e;
      const msg = (e as Error).message.split('\n')[0];
      notes.push(`The "${name}" stage stopped with an internal error: ${msg}`);
      await rec.event(`stage.${name}.error`, `Stage failed: ${msg}`, undefined, 'ERROR');
    }
    await counters();
  };

  try {
    await gb.launch();
  } catch (e) {
    if (e instanceof BrowserLaunchError) {
      // Full Chromium log goes to the run's event log (for support); the run fails with the readable reason only.
      await rec.event('browser.launch_failed', e.message, { exitCode: e.exitCode ?? null, details: e.details.slice(0, 8000) } as never, 'ERROR');
    }
    throw e;
  }
  try {
    // 1. Connect
    await ctx.stage('connecting', `Connecting to ${s.baseUrl}`);
    const safe = await checkUrlSafety(s.baseUrl, s.network);
    if (!safe.ok) throw new TargetError(`The website address is not allowed: ${safe.reason}`);
    {
      const { bctx } = await newPageContext(ctx);
      const first = await probe(ctx, bctx, s.baseUrl, true);
      await bctx.close();
      if (!first.status) {
        const cert = /cert|ssl|tls/i.test(first.error ?? '');
        throw new TargetError(cert ? `SSL/TLS problem with ${s.baseUrl}: ${first.error}` : `Website unreachable: ${first.error ?? first.blocked ?? 'no response'}`);
      }
      await ctx.stage('connecting', `Connected — HTTP ${first.status}${first.title ? ` "${first.title}"` : ''} in ${first.ms} ms`, { status: first.status, chain: first.chain });
    }

    // 2. Sign in (before any crawling), confirm each role and prove the session in a fresh browser context.
    type AuthOutcome = { role: string; status: 'SIGNED_IN' | 'FAILED'; roleCheck?: string; roleConfirmed?: boolean; dashboardUrl?: string; evidence?: string; error?: string; pages: number; sessionLost?: string };
    const outcomes = new Map<string, AuthOutcome>();
    const signIn = async (cred: TestCredential, loginPages: string[]) => {
      await ctx.stage('authenticated', `Signing in as "${cred.role}"`, { role: cred.role });
      const r = await login(ctx, cred, loginPages);
      if (!r.ok) {
        outcomes.set(cred.role, { role: cred.role, status: 'FAILED', error: r.reason, pages: 0 });
        return r;
      }
      ctx.sessions.set(cred.role, r.session);
      outcomes.set(cred.role, {
        role: cred.role, status: 'SIGNED_IN', dashboardUrl: r.session.dashboardUrl, evidence: r.evidence,
        roleCheck: r.session.roleCheck.how, roleConfirmed: r.session.roleCheck.status === 'confirmed', pages: 0,
      });
      await rec.event('auth.login', `Signed in as "${cred.role}" — ${r.evidence}. Role: ${r.session.roleCheck.how}. Dashboard: ${r.session.dashboardUrl}`, { role: cred.role, landing: r.session.landing });
      await ctx.stage('authenticated', `Signed in as "${cred.role}" — dashboard ${pathOf(r.session.dashboardUrl)}`, { role: cred.role });
      return r;
    };
    const retryNoForm: TestCredential[] = [];
    await step('authenticated', credentials.length > 0, async () => {
      for (const cred of credentials) {
        ctx.checkpoint();
        const r = await signIn(cred, []);
        if (!r.ok && r.noForm) retryNoForm.push(cred); // retried with login pages found while crawling
      }
    });
    const signedIn = () => credentials.filter((c) => ctx.sessions.has(c.role));

    // 3. Discover. With a working sign-in the public site gets a small share; the signed-in area gets the rest.
    let publicPages: CrawledPage[] = [];
    const authPagesByRole = new Map<string, CrawledPage[]>();
    await step('discovering', true, async () => {
      const publicBudget = signedIn().length ? Math.max(1, Math.min(s.maxPages, 5, Math.ceil(s.maxPages * 0.2))) : s.maxPages;
      await ctx.stage('discovering', signedIn().length
        ? `Discovering public pages (up to ${publicBudget}) before the signed-in area`
        : `Discovering pages (up to ${s.maxPages}, depth ${s.maxDepth})`);
      publicPages = await crawl(ctx, { seeds: [s.baseUrl], skip: new Set(), maxPages: publicBudget });
      ctx.pages = [...publicPages];
      await ctx.stage('discovering', `Discovered ${publicPages.length} public pages`, { pages: publicPages.length });
    });
    if (!publicPages.some((p) => (p.status ?? 0) > 0 && (p.status ?? 0) < 400) && !signedIn().length) {
      // Nothing loaded → nothing can be tested. Fail with the reason instead of "completing" with no tests.
      throw new TargetError(`No page of ${s.baseUrl} could be loaded for testing${publicPages[0]?.status ? ` (HTTP ${publicPages[0].status})` : ''}. Check that the site is up and not blocking automated browsers.`);
    }
    // Sign-in form not found on the usual pages: retry with sign-in pages the public crawl found.
    const loginPages = publicPages.filter((p) => p.inv.hasPassword).map((p) => p.url);
    if (retryNoForm.length && loginPages.length) {
      await step('authenticated', true, async () => {
        for (const cred of retryNoForm) await signIn(cred, loginPages);
      });
    }
    for (const o of outcomes.values()) {
      if (o.status === 'FAILED') {
        notes.push(`${o.error} Signed-in pages were not tested.`);
        await rec.event('auth.failed', o.error!, { role: o.role }, 'ERROR');
      }
    }

    await step('discovering', signedIn().length > 0, async () => {
      // Public pages are not re-tested signed in — except pages that showed a sign-in form or needed one.
      const anon = new Set(publicPages.filter((p) => !p.inv.hasPassword).flatMap((p) => [p.normalizedUrl, p.requestedUrl]));
      const gated = (await db.page.findMany({ where: { runId: run.id, requiresAuth: true }, select: { url: true } })).map((p) => p.url);
      const roles = signedIn();
      for (const [i, cred] of roles.entries()) {
        ctx.checkpoint();
        const session = ctx.sessions.get(cred.role)!;
        const left = Math.max(1, s.maxPages - (await db.page.count({ where: { runId: run.id } })));
        const budget = Math.max(1, Math.floor(left / (roles.length - i)));
        await ctx.stage('discovering', `Discovering pages signed in as "${cred.role}" from ${pathOf(session.dashboardUrl)} (up to ${budget}, depth ${s.maxDepth})`, { role: cred.role });
        const found = await crawl(ctx, { role: cred.role, seeds: [session.dashboardUrl, ...gated], skip: new Set(anon), maxPages: budget });
        authPagesByRole.set(cred.role, found);
        ctx.pages.push(...found);
        const lost = (await db.runEvent.findFirst({ where: { runId: run.id, type: 'auth.session_lost', message: { contains: `"${cred.role}"` } }, select: { message: true } }))?.message;
        outcomes.set(cred.role, { ...outcomes.get(cred.role)!, pages: found.length, ...(lost ? { sessionLost: lost } : {}) });
        await ctx.stage('discovering', `Found ${found.length} signed-in pages for "${cred.role}"`, { role: cred.role, pages: found.length });
      }
    });
    if (!credentials.length && (await db.page.count({ where: { runId: run.id, requiresAuth: true } }))) {
      notes.push('Some pages require signing in. Add a test account to the project to test them.');
    }
    // One summary per test login: what the report and dashboard show under "Authentication".
    for (const o of outcomes.values()) {
      await rec.event('auth.summary', o.status === 'SIGNED_IN'
        ? `"${o.role}": signed in, ${o.roleConfirmed ? 'role confirmed' : 'role not confirmed'}, dashboard ${o.dashboardUrl}, ${o.pages} signed-in page(s) discovered${o.sessionLost ? ' — session was lost during crawling' : ''}`
        : `"${o.role}": sign-in failed — ${o.error}`, o as never, o.status === 'SIGNED_IN' ? 'INFO' : 'ERROR');
      if (o.status === 'SIGNED_IN' && !o.pages) notes.push(`Signed in as "${o.role}", but no signed-in pages could be opened for testing.`);
    }

    // 4. Test. Signed-in pages first (they are why credentials were given), then the public pages.
    const groups: Array<{ role?: string; pages: CrawledPage[] }> = [
      ...signedIn().map((c) => ({ role: c.role, pages: authPagesByRole.get(c.role) ?? [] })),
      { role: undefined, pages: publicPages },
    ].filter((g) => g.pages.length);
    const ok = (p: CrawledPage) => (p.status ?? 200) < 400;
    // Interaction/layout limits are shared: signed-in pages take their slots first.
    const share = (limit: number) => {
      let left = limit;
      return groups.map((g) => {
        const take = g.pages.filter(ok).slice(0, Math.max(0, left));
        left -= take.length;
        return { role: g.role, pages: take };
      }).filter((g) => g.pages.length);
    };
    const interactive = share(s.interactionPageLimit);
    const layoutGroups = share(12);
    const count = (gs: Array<{ pages: CrawledPage[] }>) => gs.reduce((a, g) => a + g.pages.length, 0);
    const who = (gs: Array<{ role?: string; pages: CrawledPage[] }>) => {
      const signedInPages = gs.filter((g) => g.role).reduce((a, g) => a + g.pages.length, 0);
      return signedInPages ? ` (${signedInPages} signed in as ${gs.filter((g) => g.role).map((g) => `"${g.role}"`).join(', ')})` : '';
    };
    const any = (...m: TestModule[]) => m.some((x) => s.modules.has(x));
    if (!count(groups)) throw new TargetError(`No page of ${s.baseUrl} could be loaded for testing. Check that the site is up and not blocking automated browsers.`);

    await step('navigation', any('NAVIGATION'), async () => {
      await ctx.stage('navigation', `Checking navigation on ${count(groups)} pages${who(groups)}`);
      for (const g of groups) await checkNavigation(ctx, g.pages, g.role);
    });
    await step('technical', any('CONSOLE_NETWORK', 'IMAGE', 'ACCESSIBILITY', 'FUNCTIONAL'), async () => {
      await ctx.stage('technical', `Checking ${count(groups)} pages for errors, failed requests, images and accessibility${who(groups)}`);
      for (const g of groups) await checkTechnical(ctx, g.pages, g.role);
    });
    await step('buttons', any('BUTTON'), async () => {
      await ctx.stage('buttons', `Testing buttons on ${count(interactive)} pages${who(interactive)}`);
      for (const g of interactive) await checkButtons(ctx, g.pages, g.role);
    });
    await step('forms', any('FORM', 'PASSWORD'), async () => {
      await ctx.stage('forms', `Validating forms on ${count(interactive)} pages${who(interactive)}`);
      for (const g of interactive) await checkForms(ctx, g.pages, g.role);
    });
    await step('responsive', any('RESPONSIVE', 'UI_LAYOUT'), async () => {
      await ctx.stage('responsive', `Checking layouts of ${count(layoutGroups)} pages${who(layoutGroups)} at ${s.viewports.map((v) => v.label).join(', ')}`);
      for (const g of layoutGroups) await checkLayout(ctx, g.pages, g.role);
    });

    // 4. Report
    ctx.checkpoint();
    await counters();
    if (rec.counts.tests === 0) throw new TargetError('No tests could be executed on this site, so the run is not marked as completed.');
    const partial = ctx.timeLeft() <= 45_000 || notes.some((n) => n.startsWith('Time limit'));
    await db.testRun.update({ where: { id: run.id }, data: { finishedAt: new Date() } });
    // Testing is over: free the test browser before the PDF renderer starts its own.
    await gb.close();
    await ctx.stage('report', 'Generating PDF report');
    let reportId: string | undefined;
    try {
      const r = await generateReport(db, run.id, o.storageRoot, notes, { completed: true });
      reportId = r.reportId;
      await ctx.stage('report', `PDF report ready (${r.pages} pages, ${Math.round(r.sizeBytes / 1024)} KB)`, { reportId: r.reportId });
    } catch (e) {
      await rec.event('report.error', `PDF generation failed: ${(e as Error).message.split('\n')[0]}`, undefined, 'ERROR');
    }
    // The run is complete once its results and report are stored.
    await db.testRun.update({ where: { id: run.id }, data: { status: 'COMPLETED' } });
    await ctx.stage('done', `Testing complete — ${rec.counts.confirmed} issue(s), ${rec.counts.review} to review, ${rec.counts.tests} checks`);
    return { pages: await db.page.count({ where: { runId: run.id } }), tests: rec.counts.tests, passed: rec.counts.passed, failed: rec.counts.failed, confirmedIssues: rec.counts.confirmed, needsReview: rec.counts.review, reportId, partial };
  } finally {
    await gb.close();
  }
}

export { normalizeUrl };
