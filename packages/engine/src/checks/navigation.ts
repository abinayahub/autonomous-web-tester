import { newPageContext, probe, type ProbeResult } from '../crawl.js';
import type { CrawledPage, LinkInfo, RunCtx } from '../types.js';
import { NON_PAGE, inScope, normalizeUrl, pathOf } from '../url.js';
import { SOFT_404, openPage, pass, quote, report } from './common.js';

const LOGIN = /\/(log-?in|sign-?in|auth)\b/i;
const tokens = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((t) => !['the', 'and', 'for', 'our', 'your', 'page', 'more', 'view', 'see', 'all', 'html', 'php'].includes(t));

/** Internal links, broken links, redirects, missing anchors and soft-404 pages. */
export async function checkNavigation(ctx: RunCtx, pages: CrawledPage[], role?: string) {
  const { bctx } = await newPageContext(ctx, role);
  try {
    const crawled = new Map(pages.map((p) => [p.normalizedUrl, p] as const));
    for (const p of pages) if (p.requestedUrl !== p.normalizedUrl) crawled.set(p.requestedUrl, p);

    // Unique internal targets → where they are linked from.
    const targets = new Map<string, Array<{ page: CrawledPage; link: LinkInfo }>>();
    for (const p of pages) {
      for (const l of p.inv.links) {
        if (!l.href || l.raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(l.raw)) continue;
        const n = normalizeUrl(l.href);
        if (!n || !inScope(n, ctx.s) || /\/(log-?out|sign-?out)\b/i.test(n)) continue;
        if (!targets.has(n)) targets.set(n, []);
        targets.get(n)!.push({ page: p, link: l });
      }
    }
    await ctx.stage('navigation', `Checking ${targets.size} internal links`, { links: targets.size });

    let done = 0;
    for (const [target, sources] of targets) {
      ctx.checkpoint();
      if (ctx.timeLeft() < 45_000) break;
      done++;
      const first = sources[0]!;
      const linkName = `Link ${quote(first.link.text || pathOf(target), 40)} → ${pathOf(target)}`;
      let r: ProbeResult = await probe(ctx, bctx, target, true);
      if (r.error && !r.status && !r.loop) r = await probe(ctx, bctx, target, true); // one retry for transient network errors
      const finalStatus = r.status;
      const landedOnLogin = r.chain.length > 1 && LOGIN.test(new URL(r.finalUrl).pathname) && !LOGIN.test(new URL(target).pathname);
      const inNav = sources.some((s) => s.link.inNav);
      const where = sources.slice(0, 5).map((s) => `${pathOf(s.page.url)}${s.link.inNav ? ' (navigation menu)' : s.link.inFooter ? ' (footer)' : ''}`);
      const signals = { target, status: finalStatus, chain: r.chain, finalUrl: r.finalUrl, loop: r.loop, linkedFrom: where, linkText: first.link.text, responseMs: r.ms, error: r.error };
      const steps = [`Open ${first.page.url}`, `${first.link.visible ? 'Click' : 'Open the menu that contains'} the link ${quote(first.link.text || target)}`, `Observe the result at ${target}`];

      if (r.blocked) {
        await pass(ctx, { module: 'NAVIGATION', name: linkName, pageId: first.page.id, status: 'BLOCKED', observations: { ...signals, blocked: r.blocked } });
        continue;
      }
      if (landedOnLogin || finalStatus === 401 || finalStatus === 403) {
        // Expected access restriction — not a bug.
        await pass(ctx, { module: 'NAVIGATION', name: linkName, pageId: first.page.id, observations: { ...signals, note: 'Requires sign-in (expected restriction)' } });
        continue;
      }

      const evidence = async () => {
        const { page } = await openPage(bctx, first.page.url);
        const loc = page.locator(first.link.selector).first();
        if (!(await loc.isVisible().catch(() => false))) {
          // Link inside a closed menu: hover its menu item, then try the menu's toggle button, so the screenshot shows it.
          const item = page.locator(`li:has(${first.link.selector}), [class*=dropdown]:has(${first.link.selector})`).first();
          await item.hover({ timeout: 1_500 }).catch(() => undefined);
          if (!(await loc.isVisible().catch(() => false))) {
            await item.locator('button, [aria-haspopup], [class*=toggle]').first().click({ timeout: 1_500 }).catch(() => undefined);
          }
          await page.waitForTimeout(300);
        }
        return { page, loc };
      };
      const destShot = async (title: string) => {
        if (!finalStatus || r.loop) return [];
        const { page } = await openPage(bctx, target);
        const s = await ctx.rec.screenshot(page, { label: title, pageId: first.page.id });
        await page.close();
        return s ? [s.artifactId] : [];
      };

      if (r.loop) {
        const { page, loc } = await evidence();
        await report(ctx, {
          module: 'NAVIGATION', category: 'Redirect loop', severity: 'HIGH', classification: 'CONFIRMED', testName: linkName, pageRec: first.page, page, target: loc,
          title: `Link ${quote(first.link.text || pathOf(target), 40)} is stuck in a redirect loop`,
          description: `Following ${pathOf(target)} redirects in a circle (${r.chain.map((c) => pathOf(c.url)).join(' → ')} → ${pathOf(r.finalUrl)}), so the page never loads. Browsers stop with "too many redirects".`,
          expected: 'The link opens a page (HTTP 200) after at most one or two redirects.', actual: `Redirect loop: ${r.chain.map((c) => `${pathOf(c.url)} (${c.status})`).join(' → ')} → ${pathOf(r.finalUrl)}`,
          steps, signals, groupKey: target, element: { type: 'link', selector: first.link.selector, text: first.link.text },
          recommendation: 'Fix the server or CMS redirect rules so the URL resolves to a single final page; remove one of the circular rules.',
        });
        await page.close();
        continue;
      }
      if (finalStatus !== undefined && finalStatus >= 400) {
        const server = finalStatus >= 500;
        const { page, loc } = await evidence();
        const extra = await destShot(`${pathOf(target)} returns HTTP ${finalStatus}`);
        await report(ctx, {
          module: 'NAVIGATION', category: server ? 'Server error' : 'Broken link', severity: server || inNav ? 'HIGH' : 'MEDIUM', classification: 'CONFIRMED', testName: linkName, pageRec: first.page, page, target: loc,
          title: server ? `Link ${quote(first.link.text || pathOf(target), 40)} leads to a server error (HTTP ${finalStatus})` : `Broken link: ${quote(first.link.text || pathOf(target), 40)} returns HTTP ${finalStatus}`,
          description: `The ${inNav ? 'navigation link' : sources.some((s) => s.link.inFooter) ? 'footer link' : 'link'} ${quote(first.link.text || target)} points to ${pathOf(target)}, which responds with HTTP ${finalStatus}. It is linked from ${sources.length} place${sources.length === 1 ? '' : 's'}: ${where.join(', ')}.`,
          expected: 'The linked page loads successfully (HTTP 200).', actual: `HTTP ${finalStatus}${r.chain.length > 1 ? ` after redirects ${r.chain.map((c) => pathOf(c.url)).join(' → ')}` : ''}.`,
          steps, signals, groupKey: target, extraShots: extra, element: { type: 'link', selector: first.link.selector, text: first.link.text },
          recommendation: server ? 'Check the server logs for this URL and fix the exception; return a proper page.' : 'Update the link to the correct URL, restore the missing page, or add a redirect to its replacement.',
        });
        await page.close();
        continue;
      }
      if (!finalStatus) {
        const { page, loc } = await evidence();
        await report(ctx, {
          module: 'NAVIGATION', category: 'Unreachable link', severity: 'HIGH', classification: 'CONFIRMED', testName: linkName, pageRec: first.page, page, target: loc,
          title: `Link ${quote(first.link.text || pathOf(target), 40)} could not be loaded`, description: `Requesting ${pathOf(target)} failed twice: ${r.error ?? 'no response'}.`,
          expected: 'The linked page responds.', actual: r.error ?? 'No response', steps, signals, groupKey: target,
          element: { type: 'link', selector: first.link.selector, text: first.link.text }, recommendation: 'Check that the URL is served and does not time out.',
        });
        await page.close();
        continue;
      }
      // Redirect to an unrelated page (heuristic → needs review).
      if (r.chain.length > 1) {
        const from = new URL(target).pathname.replace(/\/+$/, '');
        const to = new URL(r.finalUrl).pathname.replace(/\/+$/, '');
        const words = [...new Set([...tokens(first.link.text), ...tokens(from)])];
        const dest = `${to} ${r.title ?? ''}`.toLowerCase();
        if (from.toLowerCase() !== to.toLowerCase() && words.length && !words.some((w) => dest.includes(w))) {
          const { page, loc } = await evidence();
          const extra = await destShot(`${pathOf(target)} lands on ${to || '/'}`);
          await report(ctx, {
            module: 'NAVIGATION', category: 'Unexpected redirect', severity: 'MEDIUM', classification: 'NEEDS_REVIEW', testName: linkName, pageRec: first.page, page, target: loc,
            title: `Link ${quote(first.link.text || from, 40)} redirects to an unrelated page (${to || '/'})`,
            description: `${quote(first.link.text || from)} points to ${from}, but the server redirects it to ${to || '/'}${r.title ? ` ("${r.title}")` : ''}. Nothing on the destination mentions ${words.slice(0, 3).map((w) => `"${w}"`).join(', ')}. This may be intentional, so please review it.`,
            expected: `The link opens a page about ${quote(first.link.text || from)}.`, actual: `Redirected: ${r.chain.map((c) => `${pathOf(c.url)} (${c.status})`).join(' → ')} → ${pathOf(r.finalUrl)}`,
            steps, signals, groupKey: target, extraShots: extra, element: { type: 'link', selector: first.link.selector, text: first.link.text },
            recommendation: 'Point the link (or the redirect rule) at the page the label promises, or rename the link.',
          });
          await page.close();
          continue;
        }
      }
      await pass(ctx, { module: 'NAVIGATION', name: linkName, pageId: first.page.id, observations: signals });
      if (done % 10 === 0) await ctx.stage('navigation', `Checked ${done} of ${targets.size} links`, { done, total: targets.size });
    }

    // In-page anchors with no target, and soft-404 pages.
    for (const p of pages) {
      const missing = p.inv.links.filter((l) => l.hashTarget === false && l.hash && !/^(top|!|\/)/.test(l.hash));
      const seen = new Set<string>();
      for (const l of missing) {
        if (seen.has(l.hash)) continue;
        seen.add(l.hash);
        const { page } = await openPage(bctx, p.url);
        await report(ctx, {
          module: 'NAVIGATION', category: 'Missing anchor', severity: 'LOW', classification: 'CONFIRMED', testName: `Anchor #${l.hash} on ${pathOf(p.url)}`, pageRec: p, page, target: page.locator(l.selector).first(),
          title: `In-page link ${quote(l.text || `#${l.hash}`, 40)} points to a missing section (#${l.hash})`,
          description: `The link jumps to #${l.hash}, but no element on ${pathOf(p.url)} has id or name "${l.hash}", so clicking it does nothing.`,
          expected: `An element with id="${l.hash}" exists and the page scrolls to it.`, actual: `No element with id or name "${l.hash}" exists.`,
          steps: [`Open ${p.url}`, `Click ${quote(l.text || `#${l.hash}`)}`, 'Observe that the page does not scroll to a section'],
          signals: { hash: l.hash, idExists: false, nameExists: false }, groupKey: `${p.normalizedUrl}#${l.hash}`, element: { type: 'link', selector: l.selector, text: l.text },
          recommendation: `Add id="${l.hash}" to the target section or correct the link.`,
        });
        await page.close();
      }
      const heading = `${p.inv.h1.join(' ')} ${p.title}`;
      if ((p.status ?? 200) < 300 && SOFT_404.test(heading) && !/\/(404|not-?found)\b/i.test(new URL(p.url).pathname)) {
        const { page } = await openPage(bctx, p.url);
        await report(ctx, {
          module: 'NAVIGATION', category: 'Soft 404', severity: 'MEDIUM', classification: 'CONFIRMED', testName: `Soft-404 check ${pathOf(p.url)}`, pageRec: p, page, target: page.locator('h1').first(),
          title: `${pathOf(p.url)} shows "not found" but returns HTTP ${p.status ?? 200}`,
          description: `The page at ${pathOf(p.url)} displays ${quote(p.inv.h1[0] || p.title)} while the server reports success (HTTP ${p.status ?? 200}). Users reach a dead end and search engines index an error page.`,
          expected: 'The route renders its content, or the server/app returns a real 404 for unknown routes.', actual: `Content says ${quote(p.inv.h1[0] || p.title)} with HTTP ${p.status ?? 200}.`,
          steps: [`Open ${p.url}`, 'Observe the "not found" message'], signals: { status: p.status, h1: p.inv.h1, title: p.title }, groupKey: p.normalizedUrl,
          recommendation: 'Implement the route, remove links to it, or return HTTP 404 for unknown routes.',
        });
        await page.close();
      }
    }
  } finally {
    await bctx.close().catch(() => undefined);
  }
}

export { NON_PAGE };
