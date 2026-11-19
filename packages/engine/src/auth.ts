/**
 * Form sign-in with real verification, role confirmation and session proof.
 *
 * 1. Find the sign-in form (configured login URL, the start page, known login pages, or behind a "Sign in" button/modal).
 * 2. Fill the username (incl. two-step "email → Next → password" forms) and password, click the real submit control.
 * 3. Wait for the login request/response and the navigation that follows.
 * 4. Verify with application signals, not just a "Log out" link:
 *    - a session endpoint (e.g. GET /api/auth/me) that answered 401/403 before and 2xx after,
 *    - new session cookies / storage entries, the login request's own HTTP status, the sign-in form being gone,
 *    - or the configured success indicator. A visible error or an HTTP 4xx answer is reported as the reason.
 * 5. Confirm the selected role from the account data the site returns (e.g. "role": "author") or the signed-in page.
 *    A different role stops testing for that login instead of testing the wrong area.
 * 6. Capture the session (cookies + localStorage + sessionStorage) and prove it in a brand-new browser context.
 * Secrets are never logged: events mention only role names, URLs, cookie/storage key names and HTTP statuses.
 */
import type { BrowserContext, Locator, Page, Response } from 'playwright';
import { gotoAndSettle } from './browser.js';
import { INPAGE_SCRIPT } from './inpage.js';
import type { AuthSession, RoleCheck, RunCtx, TestCredential } from './types.js';
import { pathOf } from './url.js';

const LOGIN_TEXT = /^\s*(log ?in|sign ?in|login|member login|account login)\b/i;
const SUBMIT_TEXT = /^(log ?in|sign ?in|login|continue|next|submit|go|enter)\b/i;
const SIGNED_IN = 'a:text-matches("log ?out|sign ?out", "i"), button:text-matches("log ?out|sign ?out", "i"), [aria-label*="account" i]:visible, [aria-label*="profile" i]:visible, [aria-label*="user menu" i]:visible, [data-testid*="user" i]:visible, [data-testid*="avatar" i]:visible';
/** Same-site API paths that typically tell whether a session is valid. */
const SESSION_API = /\/(auth|session|sessions|user|users|account|accounts|profile|me|whoami|current[-_]?user|identity|userinfo|token)(\/|$)/i;
/** Cookie / storage key names that usually hold a session (names only are reported, never values). */
const SESSION_KEY = /token|auth|session|sess|sid|jwt|bearer|access|login|user/i;

export type LoginResult =
  | { ok: true; session: AuthSession; evidence: string }
  | { ok: false; reason: string; noForm?: boolean };

const visibleFirst = async (l: Locator): Promise<Locator | undefined> => {
  const n = Math.min(await l.count().catch(() => 0), 8);
  for (let i = 0; i < n; i++) if (await l.nth(i).isVisible().catch(() => false)) return l.nth(i);
  return undefined;
};

async function findUsername(scope: Locator | Page): Promise<Locator | undefined> {
  for (const sel of [
    'input[autocomplete="username"]', 'input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]', 'input[name*="user" i]',
    'input[id*="user" i]', 'input[name*="login" i]', 'input[id*="login" i]', 'input[placeholder*="email" i]', 'input[placeholder*="user" i]',
    'input[placeholder*="login" i]', 'input[type="text"]', 'input:not([type])',
  ]) {
    const hit = await visibleFirst(scope.locator(sel));
    if (hit) return hit;
  }
  return undefined;
}

async function findSubmit(scope: Locator | Page): Promise<Locator | undefined> {
  return (await visibleFirst(scope.locator('button[type="submit"], input[type="submit"]')))
    ?? (await visibleFirst(scope.locator('button, [role="button"], input[type="button"]').filter({ hasText: SUBMIT_TEXT })))
    ?? (await visibleFirst(scope.locator('button:not([type])')));
}

/** Reads sessionStorage of the page's origin (Playwright's storageState does not include it). */
const readSessionStorage = (page: Page) => page.evaluate('Object.fromEntries(Object.entries(sessionStorage))').catch(() => ({})) as Promise<Record<string, string>>;
const readStorage = (page: Page) =>
  page.evaluate('({ local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)) })')
    .catch(() => ({ local: {}, session: {} })) as Promise<{ local: Record<string, string>; session: Record<string, string> }>;

/** Records same-site GET API responses on a page: path → latest status (and the JSON of 2xx session answers). */
export function watchSessionApi(ctx: RunCtx, page: Page) {
  const status = new Map<string, number>();
  const bodies = new Map<string, Promise<unknown>>();
  const on = (r: Response) => {
    const req = r.request();
    if (req.method() !== 'GET' || !['xhr', 'fetch'].includes(req.resourceType()) || !ctx.gb.isSameSite(r.url())) return;
    const path = new URL(r.url()).pathname;
    status.set(path, r.status());
    if (r.status() < 300 && SESSION_API.test(path)) bodies.set(path, r.json().catch(() => undefined));
  };
  page.on('response', on);
  return { status, bodies, stop: () => page.off('response', on) };
}

/** Role-like values from an account JSON document (only these fields are read — never tokens or personal data). */
export function extractRoles(doc: unknown, depth = 0): string[] {
  if (!doc || typeof doc !== 'object' || depth > 4) return [];
  const out: string[] = [];
  const val = (v: unknown) => {
    if (typeof v === 'string' && v.length <= 60) out.push(v);
    else if (Array.isArray(v)) for (const x of v.slice(0, 20)) val(typeof x === 'object' && x ? ((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).role) : x);
    else if (v && typeof v === 'object') val((v as Record<string, unknown>).name ?? (v as Record<string, unknown>).role);
  };
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
    if (/^(role|roles|role_?name|user_?role|user_?type|account_?type|authorities|groups|user_?group)$/i.test(k)) val(v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...extractRoles(v, depth + 1));
  }
  return [...new Set(out)];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const sameRole = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))));
};

/** Confirms the signed-in account has the selected role. Returns a mismatch reason when the site reports another role. */
async function checkRole(page: Page, role: string, apiRoles: string[], apiPath?: string): Promise<{ check: RoleCheck } | { mismatch: string }> {
  if (apiRoles.length) {
    const hit = apiRoles.find((r) => sameRole(r, role));
    if (hit) return { check: { status: 'confirmed', how: `the site reports the account role "${hit}"${apiPath ? ` (${apiPath})` : ''}` } };
    return { mismatch: `the site reports the account role ${apiRoles.map((r) => `"${r}"`).join(', ')}${apiPath ? ` (${apiPath})` : ''}, not "${role}"` };
  }
  // No role in the account data: look for the role name in the signed-in navigation/header/main area.
  const text = (await page.evaluate('(() => { const t = [...document.querySelectorAll("aside,nav,header,[role=navigation],[role=banner],main")].map((e) => e.innerText).join(" \\n "); return t.replace(/\\s+/g, " ").slice(0, 20000); })()').catch(() => '')) as string;
  const re = new RegExp(`(^|[^a-z0-9])${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
  const m = re.exec(text);
  if (m) {
    const at = Math.max(0, m.index - 25);
    return { check: { status: 'confirmed', how: `"${role}" is shown in the signed-in page ("…${text.slice(at, m.index + role.length + 25).trim()}…")` } };
  }
  return { check: { status: 'unverified', how: `the site did not show or report a role for this account, so "${role}" could not be confirmed` } };
}

/**
 * Is this page still signed in? Uses the session endpoint the page itself called, then the success indicator,
 * then the visible sign-in form. `requested` is the URL that was opened (to spot a redirect to the public start page).
 */
export async function sessionState(
  ctx: RunCtx, page: Page, session: Pick<AuthSession, 'probePath' | 'successIndicator'>, seen: Map<string, number>, requested?: string,
): Promise<{ ok: boolean; how: string }> {
  if (session.probePath) {
    let st = seen.get(session.probePath);
    if (st === undefined) {
      // The page did not ask by itself: ask the same endpoint with the page's cookies.
      st = (await page.evaluate(`fetch(${JSON.stringify(session.probePath)}, { credentials: 'include', headers: { accept: 'application/json' } }).then((r) => r.status).catch(() => 0)`).catch(() => 0)) as number;
      if (st === 401 || st === 403) {
        // Token-in-storage apps: our plain fetch has no Authorization header, so only trust a 401 if the page also looks signed out.
        const pw = await visibleFirst(page.locator('input[type="password"]'));
        if (!pw && requested && !redirectedToStart(ctx, requested, page.url())) return { ok: true, how: 'page loaded without a sign-in form' };
      }
    }
    if (st >= 200 && st < 300) return { ok: true, how: `${session.probePath} → HTTP ${st}` };
    if (st === 401 || st === 403) return { ok: false, how: `${session.probePath} answered HTTP ${st}` };
  }
  if (session.successIndicator) {
    const ind = session.successIndicator.trim();
    const vis = (await page.getByText(ind, { exact: false }).first().isVisible().catch(() => false)) || (await page.locator(ind).first().isVisible().catch(() => false));
    if (!vis) return { ok: false, how: `success indicator "${ind}" is not shown` };
  }
  const pw = await visibleFirst(page.locator('input[type="password"]'));
  const marker = await visibleFirst(page.locator(SIGNED_IN));
  if (pw && !marker) return { ok: false, how: 'a sign-in form is shown' };
  if (requested && redirectedToStart(ctx, requested, page.url())) return { ok: false, how: `redirected to the public start page ${pathOf(page.url())}` };
  return { ok: true, how: 'no sign-in form shown' };
}

/** True when opening `requested` ended on the site's root/start page instead (typical "not signed in" redirect). */
function redirectedToStart(ctx: RunCtx, requested: string, final: string): boolean {
  try {
    const r = new URL(requested), f = new URL(final), base = new URL(ctx.s.baseUrl);
    const trim = (p: string) => p.replace(/\/+$/, '') || '/';
    return trim(r.pathname) !== trim(f.pathname) && (trim(f.pathname) === '/' || trim(f.pathname) === trim(base.pathname));
  } catch {
    return false;
  }
}

/** Opens `url` in `bctx` and reports whether the restored session is still signed in. */
async function reopen(ctx: RunCtx, bctx: BrowserContext, url: string, session: Pick<AuthSession, 'probePath' | 'successIndicator'>) {
  const p = await bctx.newPage();
  const w = watchSessionApi(ctx, p);
  try {
    await gotoAndSettle(p, url);
    return await sessionState(ctx, p, session, w.status, url);
  } finally {
    w.stop();
    await p.close().catch(() => undefined);
  }
}

export async function login(ctx: RunCtx, cred: TestCredential, loginCandidates: string[]): Promise<LoginResult> {
  const vp = ctx.s.viewports.find((v) => v.deviceClass === 'DESKTOP') ?? ctx.s.viewports[0]!;
  const bctx = await ctx.gb.newContext(vp);
  await bctx.addInitScript(INPAGE_SCRIPT);
  const page = await bctx.newPage();
  const api = watchSessionApi(ctx, page);
  const origin = new URL(ctx.s.baseUrl).origin;
  try {
    // Most specific first: configured login URL, the project's own start URL, login pages found while crawling, defaults.
    const urls = [cred.loginUrl, ctx.s.baseUrl, ...loginCandidates, `${origin}/login`, `${origin}/signin`, `${origin}/sign-in`, `${origin}/account/login`, `${origin}/auth/login`, `${origin}/users/sign_in`]
      .filter((u): u is string => !!u && ctx.gb.isSameSite(u));
    let lastReason = 'No sign-in form was found';
    for (const url of [...new Set(urls)]) {
      ctx.checkpoint();
      const nav = await gotoAndSettle(page, url);
      if (nav.error || (nav.status ?? 0) >= 400) continue;
      let pw = await visibleFirst(page.locator('input[type="password"]'));
      let user = await findUsername(page);
      if (!pw && !user) {
        // Sign-in behind a "Sign in" link/button (modal or separate page).
        const opener = await visibleFirst(page.locator('a, button, [role="button"]').filter({ hasText: LOGIN_TEXT }));
        if (!opener) continue;
        await opener.click({ timeout: 5_000 }).catch(() => undefined);
        await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => undefined);
        await page.locator('input[type="password"], input[type="email"]').first().waitFor({ state: 'visible', timeout: 6_000 }).catch(() => undefined);
        pw = await visibleFirst(page.locator('input[type="password"]'));
        user = await findUsername(page);
      }
      if (!user && !pw) continue;
      const form = pw ? page.locator('form').filter({ has: pw }).first() : page.locator('form').filter({ has: user! }).first();
      const scope = (await form.count()) ? form : page;
      user = (await findUsername(scope)) ?? user;
      if (!user) { lastReason = `A password field was found on ${pathOf(url)} but no username/email field`; continue; }

      // Baseline before submitting: session endpoints and session cookies/storage as they are signed out.
      const apiBefore = new Map(api.status);
      const cookiesBefore = new Map((await bctx.cookies()).map((c) => [c.name, c.value]));
      const storeBefore = await readStorage(page);
      const responses: Array<{ status: number; method: string; path: string }> = [];
      const onResp = (r: Response) => {
        const m = r.request().method();
        if (m !== 'GET' && ctx.gb.isSameSite(r.url())) responses.push({ status: r.status(), method: m, path: pathOf(r.url()) });
      };
      page.on('response', onResp);
      ctx.gb.openLoginWindow(30_000); // the sign-in POST is the one data-changing request allowed even on production sites
      await user.fill(cred.username);
      if (!pw) {
        // Two-step form: submit the username first, then the password appears.
        const next = await findSubmit(scope);
        if (next) await next.click({ timeout: 5_000 }).catch(() => undefined);
        else await user.press('Enter').catch(() => undefined);
        pw = await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 8_000 }).then(() => page.locator('input[type="password"]').first()).catch(() => undefined);
        if (!pw) { page.off('response', onResp); lastReason = `After entering the username on ${pathOf(url)}, no password field appeared`; continue; }
      }
      await pw.fill(cred.password);
      const before = page.url();
      const pwForm = page.locator('form').filter({ has: pw }).first();
      const submit = await findSubmit((await pwForm.count()) ? pwForm : page);
      // Wait for the sign-in request itself, not just any event.
      const loginResponse = page.waitForResponse((r) => r.request().method() !== 'GET' && ctx.gb.isSameSite(r.url()), { timeout: 15_000 }).catch(() => undefined);
      if (submit) await submit.click({ timeout: 5_000 }).catch(() => pw!.press('Enter'));
      else await pw.press('Enter');
      await loginResponse;
      await page.waitForURL((u) => u.href !== before, { timeout: 8_000 }).catch(() => undefined);
      await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      page.off('response', onResp);

      // ── Verify with application signals ──
      const shownError = ((await page.evaluate('window.__awt ? window.__awt.errorsVisible() : []').catch(() => [])) as string[])[0];
      const rejected = responses.find((r) => r.status === 401 || r.status === 403 || r.status === 422 || r.status === 400);
      const loginOk = responses.find((r) => r.status >= 200 && r.status < 400);
      const pwVisible = !!(await visibleFirst(page.locator('input[type="password"]')));
      // Session endpoints that were 401/403 before and are now 2xx (ask again if the app did not re-request them).
      const candidates = [...apiBefore].filter(([p, st]) => (st === 401 || st === 403) && SESSION_API.test(p)).map(([p]) => p);
      for (const p of candidates) {
        if ((api.status.get(p) ?? 0) >= 300 || api.status.get(p) === apiBefore.get(p)) {
          const st = (await page.evaluate(`fetch(${JSON.stringify(p)}, { credentials: 'include', headers: { accept: 'application/json' } }).then(async (r) => [r.status, r.ok ? await r.json().catch(() => null) : null]).catch(() => [0, null])`).catch(() => [0, null])) as [number, unknown];
          api.status.set(p, st[0]);
          if (st[0] >= 200 && st[0] < 300) api.bodies.set(p, Promise.resolve(st[1]));
        }
      }
      const flipped = candidates.find((p) => (api.status.get(p) ?? 0) >= 200 && (api.status.get(p) ?? 0) < 300);
      // A session endpoint first seen after sign-in (2xx) also counts, if nothing flipped.
      const probePath = flipped ?? [...api.status].find(([p, st]) => st >= 200 && st < 300 && SESSION_API.test(p) && !apiBefore.has(p) && /auth|session|me|whoami|current|userinfo/i.test(p))?.[0];
      const cookiesAfter = await bctx.cookies();
      const storeAfter = await readStorage(page);
      const newCookies = cookiesAfter.filter((c) => cookiesBefore.get(c.name) !== c.value && SESSION_KEY.test(c.name)).map((c) => c.name);
      const newKeys = [...Object.entries(storeAfter.local), ...Object.entries(storeAfter.session)]
        .filter(([k, v]) => SESSION_KEY.test(k) && storeBefore.local[k] !== v && storeBefore.session[k] !== v).map(([k]) => k);
      const marker = await visibleFirst(page.locator(SIGNED_IN));

      let ok: boolean;
      let how: string;
      if (cred.successIndicator) {
        const ind = cred.successIndicator.trim();
        const deadline = Date.now() + 8_000;
        ok = false;
        while (!ok && Date.now() < deadline) {
          ok = (await page.getByText(ind, { exact: false }).first().isVisible().catch(() => false)) || (await page.locator(ind).first().isVisible().catch(() => false));
          if (!ok) await page.waitForTimeout(400);
        }
        how = ok ? `success indicator "${ind}" is visible` : `success indicator "${ind}" did not appear`;
      } else {
        ok = !pwVisible && !rejected && (!!flipped || !!marker || (!!loginOk && (newCookies.length + newKeys.length > 0 || page.url() !== before)));
        how = ok ? 'signed in' : pwVisible ? 'the sign-in form is still shown' : 'no sign of an active session (no session endpoint, session cookie/storage or signed-in element changed)';
      }
      if (!ok) {
        const why = shownError ? `the site said "${shownError}"` : rejected ? `the server answered HTTP ${rejected.status} to ${rejected.method} ${rejected.path}` : how;
        return { ok: false, reason: `Sign-in as "${cred.role}" failed on ${pathOf(url)}: ${why}.` };
      }
      const proof = [
        loginOk ? `login request ${loginOk.method} ${loginOk.path} → HTTP ${loginOk.status}` : '',
        flipped ? `${flipped} changed from HTTP ${apiBefore.get(flipped)} to ${api.status.get(flipped)}` : probePath ? `${probePath} → HTTP ${api.status.get(probePath)}` : '',
        newCookies.length ? `session cookie ${newCookies.join(', ')} set` : '',
        newKeys.length ? `session storage ${newKeys.join(', ')} set` : '',
        marker ? 'signed-in element shown' : '',
        cred.successIndicator ? how : '',
      ].filter(Boolean);

      // ── Role ──
      const apiRoles = probePath ? extractRoles(await api.bodies.get(probePath)) : [];
      const role = await checkRole(page, cred.role, apiRoles, probePath);
      if ('mismatch' in role) {
        return { ok: false, reason: `Signed in, but this account does not have the selected role: ${role.mismatch}. Signed-in pages were not tested for "${cred.role}".` };
      }

      // ── Session reusable in a brand-new context (cookies + local + session storage) ──
      const session: AuthSession = {
        role: cred.role, landing: page.url(), dashboardUrl: page.url(), storageState: await bctx.storageState(),
        sessionStorage: { [new URL(page.url()).origin]: await readSessionStorage(page) }, successIndicator: cred.successIndicator,
        probePath, roleCheck: role.check,
      };
      const check = await ctx.gb.newContext(vp, session);
      await check.addInitScript(INPAGE_SCRIPT);
      try {
        const again = await reopen(ctx, check, session.landing, session);
        if (!again.ok) return { ok: false, reason: `Sign-in as "${cred.role}" succeeded, but the session was not kept when reopening ${pathOf(session.landing)} (${again.how}).` };
      } finally {
        await check.close().catch(() => undefined);
      }
      const moved = page.url() !== before ? `opened ${pathOf(page.url())}` : '';
      return { ok: true, session, evidence: [moved, ...proof].filter(Boolean).join('; ') };
    }
    return { ok: false, noForm: true, reason: `Sign-in as "${cred.role}" failed: ${lastReason}${cred.loginUrl ? '' : '. Set the login page URL for this test account.'}` };
  } finally {
    api.stop();
    await bctx.close().catch(() => undefined);
  }
}

/** True when a page that should be signed in shows a sign-in form instead (session lost / logged out). */
export async function lostSession(page: Page): Promise<boolean> {
  const pw = await visibleFirst(page.locator('input[type="password"]'));
  if (!pw) return false;
  const marker = await visibleFirst(page.locator(SIGNED_IN));
  return !marker;
}
