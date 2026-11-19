import { checkUrlSafety } from '@awt/crypto';
import type { BrowserContext } from 'playwright';
import { gotoAndSettle, monitorPage } from './browser.js';
import { INPAGE_SCRIPT } from './inpage.js';
import { sessionState, watchSessionApi } from './auth.js';
import { classifyAction } from './risk.js';
import type { ButtonInfo, CrawledPage, Inventory, RunCtx } from './types.js';
import { NON_PAGE, inScope, normalizeUrl, pageNameFromUrl, pathOf } from './url.js';

export interface ProbeResult {
  url: string;
  status?: number;
  finalUrl: string;
  chain: Array<{ url: string; status: number }>;
  loop: boolean;
  blocked?: string;
  error?: string;
  ms: number;
  title?: string;
}

/** HTTP check of one URL with the context's cookies; every redirect hop is SSRF-checked. Never follows off-site. */
export async function probe(ctx: RunCtx, bctx: BrowserContext, url: string, readTitle = false): Promise<ProbeResult> {
  const started = Date.now();
  const chain: ProbeResult['chain'] = [];
  let current = url;
  for (let hop = 0; hop < 10; hop++) {
    const safe = await checkUrlSafety(current, ctx.s.network);
    if (!safe.ok) return { url, finalUrl: current, chain, loop: false, blocked: safe.reason, ms: Date.now() - started };
    if (hop > 0 && !ctx.gb.isSameSite(current)) return { url, finalUrl: current, chain, loop: false, status: chain.at(-1)?.status, error: 'Redirects outside the authorized site', ms: Date.now() - started };
    try {
      const res = await bctx.request.get(current, { maxRedirects: 0, timeout: 15_000, failOnStatusCode: false, headers: { accept: 'text/html,*/*;q=0.8' } });
      const status = res.status();
      chain.push({ url: current, status });
      const loc = res.headers()['location'];
      if (status >= 300 && status < 400 && loc) {
        const next = new URL(loc, current).href;
        if (chain.some((c) => c.url === next)) return { url, finalUrl: next, chain, loop: true, status, ms: Date.now() - started };
        current = next;
        await res.dispose();
        continue;
      }
      let title: string | undefined;
      if (readTitle && /text\/html/i.test(res.headers()['content-type'] ?? '')) {
        const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec((await res.text()).slice(0, 200_000));
        title = m?.[1]?.replace(/\s+/g, ' ').trim();
      }
      await res.dispose();
      return { url, status, finalUrl: current, chain, loop: false, ms: Date.now() - started, title };
    } catch (e) {
      return { url, finalUrl: current, chain, loop: false, error: (e as Error).message.split('\n')[0], ms: Date.now() - started };
    }
  }
  return { url, finalUrl: current, chain, loop: true, status: chain.at(-1)?.status, ms: Date.now() - started };
}

const LOGIN_PATH = /\/(log-?in|sign-?in|auth|account\/login|users?\/sign_in)\b/i;

export async function newPageContext(ctx: RunCtx, role?: string) {
  const vp = ctx.s.viewports.find((v) => v.deviceClass === 'DESKTOP' && v.width <= 1440) ?? ctx.s.viewports[0]!;
  const bctx = await ctx.gb.newContext(vp, role ? ctx.sessions.get(role) : undefined);
  await bctx.addInitScript(INPAGE_SCRIPT);
  return { bctx, vp };
}

async function sitemapUrls(ctx: RunCtx, bctx: BrowserContext): Promise<string[]> {
  try {
    const origin = new URL(ctx.s.baseUrl).origin;
    const p = await probe(ctx, bctx, `${origin}/sitemap.xml`);
    if (p.status !== 200 || !ctx.gb.isSameSite(p.finalUrl)) return [];
    const res = await bctx.request.get(p.finalUrl, { timeout: 15_000, maxRedirects: 0 });
    const xml = (await res.text()).slice(0, 2_000_000);
    await res.dispose();
    return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!).slice(0, 2000);
  } catch {
    return [];
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Buttons that toggle UI chrome rather than navigate. */
const UI_TOGGLE = /^(collapse|expand|toggle|open|close|show|hide|menu|cancel|dismiss|back|next|previous|prev|more|less|search|filter|sort|edit|change password|copy|print|download|refresh|reload|x)\b/i;

/**
 * Single-page apps often navigate with <button>s (sidebar, menus, "View all …") instead of <a href>.
 * Clicks each candidate in a read-only page — every data-changing request is blocked, destructive and sign-out
 * controls are never clicked — and returns the same-site URLs those clicks opened.
 */
async function routesFromButtons(ctx: RunCtx, bctx: BrowserContext, pageUrl: string, buttons: ButtonInfo[]): Promise<Array<{ url: string; label: string; inNav: boolean }>> {
  const found: Array<{ url: string; label: string; inNav: boolean }> = [];
  if (!buttons.length) return found;
  const page = await bctx.newPage();
  await page.route('**/*', (route) => (MUTATING_METHODS.has(route.request().method().toUpperCase()) ? route.abort('blockedbyclient') : route.fallback()));
  page.on('dialog', (d) => void d.dismiss().catch(() => undefined));
  try {
    let fresh = false;
    for (const b of buttons) {
      ctx.checkpoint();
      if (ctx.timeLeft() < 90_000) break;
      if (!fresh) {
        const nav = await gotoAndSettle(page, pageUrl);
        if (nav.error && !nav.response) break;
        fresh = true;
      }
      const before = page.url();
      const target = page.locator(b.selector).first();
      if (!(await target.isVisible().catch(() => false))) continue;
      fresh = false; // any click may change the page state; reload before the next one
      await target.click({ timeout: 3_000 }).catch(() => undefined);
      await page.waitForURL((u) => u.href !== before, { timeout: 2_500 }).catch(() => undefined);
      const after = page.url();
      if (after !== before && ctx.gb.isSameSite(after)) found.push({ url: after, label: b.text, inNav: b.inNav });
    }
  } finally {
    await page.close().catch(() => undefined);
  }
  return found;
}

/**
 * Breadth-first crawl. Pages are de-duplicated by normalized URL (requested and final), limited by maxPages/maxDepth,
 * restricted to the authorized hosts, and recorded in the database as they are visited.
 */
export async function crawl(ctx: RunCtx, opts: { role?: string; seeds: string[]; skip: Set<string>; maxPages: number }): Promise<CrawledPage[]> {
  const { bctx } = await newPageContext(ctx, opts.role);
  const session = opts.role ? ctx.sessions.get(opts.role) : undefined;
  const out: CrawledPage[] = [];
  const queued = new Set<string>(opts.skip);
  // Button navigation: each label is tried once per crawl (a sidebar repeats on every page); bounded per crawl.
  const triedButtons = new Set<string>();
  let buttonBudget = opts.role ? 40 : 15;
  const areaPrefix = (() => {
    try {
      const p = new URL(opts.seeds[0] ?? '').pathname.replace(/\/+$/, '');
      return p && p !== '/' ? `${p}/` : '';
    } catch {
      return '';
    }
  })();
  const queue: Array<{ url: string; depth: number; from?: string; source: 'SEED' | 'SITEMAP' | 'LINK' | 'NAV_MENU' | 'DROPDOWN' | 'SPA_ROUTE' | 'REDIRECT' }> = [];
  const push = (raw: string, depth: number, source: (typeof queue)[number]['source'], from?: string) => {
    const n = normalizeUrl(raw);
    if (!n || queued.has(n) || depth > ctx.s.maxDepth) return;
    if (!inScope(n, ctx.s) || NON_PAGE.test(new URL(n).pathname)) return;
    if (/\/(log-?out|sign-?out|log-?off)\b/i.test(new URL(n).pathname)) return; // would end the test session
    // Signed in: the site's own login/sign-up pages are not part of the authenticated area (and always show a form).
    if (opts.role && source !== 'SEED' && /\/(log-?in|sign-?in|sign-?up|register|auth)\b/i.test(new URL(n).pathname)) return;
    queued.add(n);
    // Signed in: pages under the post-login landing path (e.g. /portal/…) come first.
    if (opts.role && areaPrefix && new URL(n).pathname.startsWith(areaPrefix)) queue.unshift({ url: n, depth, from, source });
    else queue.push({ url: n, depth, from, source });
  };
  // Seeds are always visited (after sign-in the same URL can show different content, e.g. a dashboard at "/").
  for (const s of opts.seeds) {
    const n = normalizeUrl(s);
    if (n) queued.delete(n);
    push(s, 0, 'SEED');
  }
  if (!opts.role) for (const u of await sitemapUrls(ctx, bctx)) push(u, 1, 'SITEMAP');

  // Signed-in pages get their own record so they never overwrite the public version of the same URL.
  const key = (norm: string) => (opts.role ? `${norm}#as=${opts.role}` : norm);
  const idByNorm = new Map<string, string>();
  try {
    while (queue.length && out.length < opts.maxPages) {
      ctx.checkpoint();
      if (ctx.timeLeft() < 60_000) {
        await ctx.rec.event('crawl.limit', `Discovery stopped early to stay within the run time limit (${queue.length} URLs not visited)`, undefined, 'WARN');
        break;
      }
      const item = queue.shift()!;
      const page = await bctx.newPage();
      const signals = monitorPage(page);
      const api = watchSessionApi(ctx, page);
      const nav = await gotoAndSettle(page, item.url);
      api.stop();
      const finalUrl = page.url();
      const finalNorm = normalizeUrl(finalUrl) ?? item.url;
      const chainRec = ctx.gb.net.filter((r) => r.isNavigation && r.url === item.url && r.redirectChain).at(-1);
      try {
        // Redirected to a login form → the page needs a session. That is expected, not a bug.
        const requestedPath = new URL(item.url).pathname;
        const landedOnLogin = finalNorm !== item.url && LOGIN_PATH.test(new URL(finalUrl).pathname) && !LOGIN_PATH.test(requestedPath);
        if (opts.role && session) {
          const state = landedOnLogin ? { ok: false, how: `redirected to the sign-in page ${pathOf(finalUrl)}` } : await sessionState(ctx, page, session, api.status, item.url);
          if (!state.ok) {
            // Is the whole session gone, or is only this route not available to the role? Ask the session endpoint.
            const still = session.probePath && !landedOnLogin ? await sessionState(ctx, page, session, new Map()) : { ok: false, how: state.how };
            if (still.ok && session.probePath) {
              await ctx.rec.event('auth.route_denied', `"${opts.role}" cannot open ${pathOf(item.url)} (${state.how}); the session is still active — page skipped.`, { role: opts.role, url: item.url }, 'INFO');
              ctx.log(`not available to ${opts.role}: ${pathOf(item.url)}`);
              continue;
            }
            // Signed-in crawl lost its session (expired, or logged out by the site). Stop here instead of testing
            // public or sign-in pages as if they were the authenticated area.
            await ctx.rec.event('auth.session_lost', `Session for "${opts.role}" was lost at ${pathOf(item.url)} (${state.how}) — signed-in crawling stopped after ${out.length} page(s).`, { role: opts.role, url: item.url }, 'WARN');
            break;
          }
        }
        if (landedOnLogin) {
          const rec = await ctx.rec.upsertPage({ url: item.url, normalizedUrl: item.url, pageName: pageNameFromUrl(item.url), statusCode: chainRec ? 302 : nav.status, depth: item.depth, discoveredFromId: item.from ? idByNorm.get(item.from) : undefined, source: item.source, requiresAuth: true });
          idByNorm.set(item.url, rec.id);
          ctx.log(`requires sign-in: ${pathOf(item.url)}`);
          continue;
        }
        if (finalNorm !== item.url && queued.has(finalNorm)) continue; // redirect alias of a page already visited or queued (in this or the anonymous crawl)
        queued.add(finalNorm);
        if (nav.error && !nav.response) {
          const rec = await ctx.rec.upsertPage({ url: item.url, normalizedUrl: item.url, pageName: pageNameFromUrl(item.url), depth: item.depth, discoveredFromId: item.from ? idByNorm.get(item.from) : undefined, source: item.source });
          idByNorm.set(item.url, rec.id);
          await ctx.rec.event('page.failed', `Could not load ${pathOf(item.url)}: ${nav.error}`, { url: item.url }, 'WARN');
          continue;
        }
        const inv = (await page.evaluate('window.__awt.inventory()').catch(() => null)) as Inventory | null;
        if (!inv) continue;
        const rec = await ctx.rec.upsertPage({
          url: finalUrl, normalizedUrl: key(finalNorm), title: inv.title, pageName: inv.h1[0] || inv.title || pageNameFromUrl(finalUrl), statusCode: nav.status,
          depth: item.depth, discoveredFromId: item.from ? idByNorm.get(item.from) : undefined, source: item.source, isSpaRoute: item.source === 'SPA_ROUTE',
          loadTimeMs: nav.loadTimeMs, requiresAuth: !!opts.role,
        });
        idByNorm.set(finalNorm, rec.id);
        if (item.url !== finalNorm) idByNorm.set(item.url, rec.id);
        out.push({ id: rec.id, requestedUrl: item.url, url: finalUrl, normalizedUrl: finalNorm, title: inv.title, status: nav.status, depth: item.depth, loadTimeMs: nav.loadTimeMs, inv, signals, requiresAuth: !!opts.role, role: opts.role, redirectChain: chainRec?.redirectChain });
        ctx.log(`page ${out.length}: ${pathOf(finalUrl)} (${nav.status ?? '—'}, ${nav.loadTimeMs} ms, ${inv.links.length} links, ${inv.buttons.length} buttons, ${inv.forms.length} forms)`);
        for (const l of inv.links) {
          if (l.download || !l.href) continue;
          const source = l.inNav ? (l.visible ? 'NAV_MENU' : 'DROPDOWN') : 'LINK';
          push(l.href, item.depth + 1, source, finalNorm);
        }
        for (const b of inv.buttons) if (b.dataRoute) push(new URL(b.dataRoute, finalUrl).href, item.depth + 1, 'SPA_ROUTE', finalNorm);
        // Routes behind navigation buttons. Signed in: also content buttons such as "View all submissions".
        if (buttonBudget > 0 && item.depth < ctx.s.maxDepth) {
          const candidates = inv.buttons
            .filter((b) => !b.disabled && !b.inForm && !b.dataRoute && b.text && b.text.length <= 60 && (b.inNav || !!opts.role))
            .filter((b) => !UI_TOGGLE.test(b.text) && classifyAction(b.text).risk !== 'DESTRUCTIVE' && !/^(log ?in|sign ?in|sign ?up|register)\b/i.test(b.text))
            .filter((b) => !triedButtons.has(b.text.toLowerCase()))
            .sort((a, b) => Number(b.inNav) - Number(a.inNav))
            .slice(0, Math.min(15, buttonBudget));
          for (const b of candidates) triedButtons.add(b.text.toLowerCase());
          buttonBudget -= candidates.length;
          for (const r of await routesFromButtons(ctx, bctx, finalUrl, candidates)) {
            ctx.log(`button "${r.label}" opens ${pathOf(r.url)}`);
            push(r.url, item.depth + 1, r.inNav ? 'NAV_MENU' : 'SPA_ROUTE', finalNorm);
          }
        }
        if (out.length % 5 === 0) await ctx.stage('discovering', `Discovered ${out.length} pages`, { pages: out.length, queued: queue.length });
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await bctx.close().catch(() => undefined);
  }
  return out;
}
