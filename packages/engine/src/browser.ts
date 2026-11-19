/**
 * Guarded Chromium: every request from every page passes through `route()` below.
 *
 * - SSRF: each URL — and each redirect hop, which we resolve ourselves — is checked with checkUrlSafety().
 * - Scope: main-frame navigations may not leave the authorized hosts; data-changing requests never go to third parties.
 * - Safety: on PRODUCTION projects every data-changing request (POST/PUT/PATCH/DELETE) is blocked; elsewhere DELETE is
 *   always blocked and other mutations are allowed only to the authorized hosts (test/staging environments).
 *   The engine can temporarily open a "login" window to allow a credential sign-in POST in any environment.
 * - Rate limit: same-site document/XHR requests are spaced to `rps`.
 * Blocked requests are recorded (they are policy, not site failures) and counted as "the page tried to do something".
 */
import { checkUrlSafety, isHostAllowed, type NetworkPolicy } from '@awt/crypto';
import type { ViewportProfile } from '@awt/shared';
import type { Browser, BrowserContext, Page, Route } from 'playwright';
import { launchChromium } from './launch.js';

export type Environment = 'PRODUCTION' | 'STAGING' | 'TEST' | 'LOCAL';

export interface GuardOptions {
  allowedHosts: string[];
  environment: Environment;
  network: NetworkPolicy;
  rps: number;
  userAgent?: string;
}

export interface NetRecord {
  at: number;
  url: string;
  method: string;
  resourceType: string;
  isNavigation: boolean;
  /** Why the guard refused it (policy, not a site failure). */
  blocked?: string;
  redirectChain?: string[];
  redirectLoop?: boolean;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_HOPS = 10;

export class GuardedBrowser {
  private browser?: Browser;
  /** All network decisions, newest last (bounded). */
  readonly net: NetRecord[] = [];
  private loginWindowUntil = 0;
  private lastSameSite = 0;

  constructor(private readonly opts: GuardOptions) {}

  async launch() {
    // Fresh browser per run, temporary profile (never a user's Chrome profile); readable error if it can't start.
    this.browser = await launchChromium({ args: ['--disable-dev-shm-usage', '--no-default-browser-check', '--no-first-run'] });
    return this;
  }

  async close() {
    const b = this.browser;
    this.browser = undefined;
    await b?.close().catch(() => undefined);
  }

  /** Allows a credential sign-in POST for a short window (any environment). */
  openLoginWindow(ms = 15_000) {
    this.loginWindowUntil = Date.now() + ms;
  }

  isSameSite(url: string): boolean {
    try {
      return isHostAllowed(new URL(url).hostname, this.opts.allowedHosts);
    } catch {
      return false;
    }
  }

  private record(r: Omit<NetRecord, 'at'>) {
    this.net.push({ at: Date.now(), ...r });
    if (this.net.length > 5000) this.net.splice(0, 1000);
  }

  private async pace() {
    const gap = 1000 / Math.max(1, this.opts.rps);
    const wait = this.lastSameSite + gap - Date.now();
    this.lastSameSite = Math.max(Date.now(), this.lastSameSite + gap);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  async newContext(viewport: ViewportProfile, session?: { storageState: unknown; sessionStorage?: Record<string, Record<string, string>> }): Promise<BrowserContext> {
    if (!this.browser) throw new Error('Browser not launched');
    const ctx = await this.browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: Math.min(viewport.deviceScaleFactor, 2),
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      serviceWorkers: 'block', // so every request is routed through the guard
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
      userAgent: this.opts.userAgent,
      storageState: session?.storageState as Awaited<ReturnType<BrowserContext['storageState']>> | undefined,
    });
    if (session?.sessionStorage && Object.keys(session.sessionStorage).length) {
      // Playwright's storageState has no sessionStorage; many single-page apps keep their login token there.
      await ctx.addInitScript(`(() => { try { const d = ${JSON.stringify(session.sessionStorage)}[location.origin]; if (d) for (const [k, v] of Object.entries(d)) if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, v); } catch (e) {} })()`);
    }
    ctx.setDefaultTimeout(15_000);
    ctx.setDefaultNavigationTimeout(30_000);
    await ctx.route('**/*', (route) => this.handle(route));
    await ctx.routeWebSocket(/.*/, async (ws) => {
      const url = ws.url().replace(/^ws/, 'http');
      const safe = await checkUrlSafety(url, this.opts.network);
      if (!safe.ok || !this.isSameSite(url)) {
        this.record({ url: ws.url(), method: 'GET', resourceType: 'websocket', isNavigation: false, blocked: safe.ok ? 'WebSocket to a third-party host' : safe.reason });
        await ws.close({ code: 1008, reason: 'Blocked by testing safety policy' });
        return;
      }
      ws.connectToServer();
    });
    // Pages may not open popups to arbitrary hosts; record and close them.
    ctx.on('page', (p) => {
      void p.opener().then((op) => (op ? p.close() : undefined)).catch(() => undefined);
    });
    return ctx;
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return route.continue();
    const method = req.method().toUpperCase();
    const isNav = req.isNavigationRequest() && req.frame().parentFrame() === null;
    const base = { url, method, resourceType: req.resourceType(), isNavigation: isNav };

    const safe = await checkUrlSafety(url, this.opts.network);
    if (!safe.ok) {
      this.record({ ...base, blocked: `SSRF guard: ${safe.reason}` });
      return route.abort('blockedbyclient');
    }
    const same = this.isSameSite(url);
    if (isNav && !same) {
      this.record({ ...base, blocked: 'Navigation outside the authorized site' });
      return route.abort('blockedbyclient');
    }
    if (MUTATING.has(method)) {
      const login = Date.now() < this.loginWindowUntil && method === 'POST';
      let reason: string | undefined;
      if (!same) reason = 'Data-changing request to a third-party host';
      else if (method === 'DELETE') reason = 'DELETE requests are never sent';
      else if (this.opts.environment === 'PRODUCTION' && !login) reason = 'Production site: data-changing requests are blocked (observe-only)';
      if (reason) {
        this.record({ ...base, blocked: reason });
        return route.abort('blockedbyclient');
      }
    }
    if (same && (isNav || req.resourceType() === 'xhr' || req.resourceType() === 'fetch')) await this.pace();

    // Resolve redirects ourselves so every hop is checked.
    const chain = [url];
    let current = url;
    let res;
    try {
      for (let hop = 0; ; hop++) {
        res = await route.fetch(hop === 0 ? { maxRedirects: 0, timeout: 30_000 } : { url: current, method: 'GET', postData: undefined, maxRedirects: 0, timeout: 30_000 });
        const loc = res.headers()['location'];
        if (res.status() < 300 || res.status() >= 400 || !loc) break;
        const next = new URL(loc, current).href;
        if (chain.includes(next) || hop + 1 >= MAX_HOPS) {
          this.record({ ...base, redirectChain: [...chain, next], redirectLoop: true });
          return route.abort('failed');
        }
        const ok = await checkUrlSafety(next, this.opts.network);
        if (!ok.ok) {
          this.record({ ...base, redirectChain: [...chain, next], blocked: `Redirect blocked by SSRF guard: ${ok.reason}` });
          return route.abort('blockedbyclient');
        }
        if (isNav && !this.isSameSite(next)) {
          this.record({ ...base, redirectChain: [...chain, next], blocked: 'Redirect leaves the authorized site' });
          return route.abort('blockedbyclient');
        }
        chain.push(next);
        current = next;
      }
    } catch (e) {
      // Network failure / timeout: let it surface as a failed request on the page.
      this.record({ ...base });
      return route.abort('failed').catch(() => undefined);
    }
    if (chain.length > 1) this.record({ ...base, redirectChain: chain });
    if (chain.length > 1 && isNav) {
      // Let the browser land on the (already validated) final URL so page.url() and relative links are correct.
      return route.fulfill({ status: 302, headers: { location: current } });
    }
    return route.fulfill({ response: res });
  }
}

// ── Per-page monitoring ─────────────────────────────────────────

export interface PageSignals {
  consoleErrors: Array<{ text: string; location?: string }>;
  pageErrors: Array<{ message: string; stack?: string }>;
  failedRequests: Array<{ url: string; method: string; resourceType: string; status?: number; failure?: string }>;
  insecureRequests: string[];
  dialogs: string[];
}

/** Collects console errors, uncaught exceptions and failed requests (excluding guard blocks) for a page. */
export function monitorPage(page: Page): PageSignals {
  const s: PageSignals = { consoleErrors: [], pageErrors: [], failedRequests: [], insecureRequests: [], dialogs: [] };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location();
    const text = m.text();
    // Network failures already appear as failed requests; skip Chromium's duplicate console line.
    if (/^Failed to load resource/i.test(text)) return;
    s.consoleErrors.push({ text: text.slice(0, 500), location: loc.url ? `${loc.url}:${loc.lineNumber}` : undefined });
  });
  page.on('pageerror', (e) => s.pageErrors.push({ message: e.message.slice(0, 500), stack: e.stack?.split('\n').slice(0, 4).join('\n') }));
  page.on('dialog', (d) => {
    s.dialogs.push(`${d.type()}: ${d.message().slice(0, 200)}`);
    void d.dismiss().catch(() => undefined);
  });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? 'failed';
    if (/ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/.test(f)) return; // our guard or navigation-cancelled requests
    s.failedRequests.push({ url: r.url(), method: r.method(), resourceType: r.resourceType(), failure: f });
  });
  page.on('response', (r) => {
    const st = r.status();
    if (st >= 400) s.failedRequests.push({ url: r.url(), method: r.request().method(), resourceType: r.request().resourceType(), status: st });
    try {
      if (page.url().startsWith('https:') && r.url().startsWith('http:')) s.insecureRequests.push(r.url());
    } catch {
      /* page closed */
    }
  });
  return s;
}

/** Navigates and waits for the page to settle (load + short network quiet), never throwing on slow pages. */
export async function gotoAndSettle(page: Page, url: string, timeoutMs = 30_000) {
  const started = Date.now();
  let response = null;
  let error: string | undefined;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 2_500 }).catch(() => undefined);
  } catch (e) {
    error = (e as Error).message.split('\n')[0];
  }
  return { response, status: response?.status(), loadTimeMs: Date.now() - started, error, finalUrl: page.url() };
}
