import type { Page } from 'playwright';
import { newPageContext } from '../crawl.js';
import type { CrawledPage, RunCtx } from '../types.js';
import { pathOf } from '../url.js';
import { openPage, pass, quote, report } from './common.js';

const normMsg = (s: string) => s.replace(/https?:\/\/\S+/g, '<url>').replace(/\d+/g, '#').slice(0, 160);

interface Contrast { selector: string; text: string; ratio: number; required: number; color: string; background: string; fontSize: number }

/** Console/JS errors, failed requests, broken images, metadata, basic accessibility and security signals. */
export async function checkTechnical(ctx: RunCtx, pages: CrawledPage[], role?: string) {
  const { bctx } = await newPageContext(ctx, role);
  const titles = new Map<string, CrawledPage[]>();
  try {
    let i = 0;
    for (const p of pages) {
      ctx.checkpoint();
      if (ctx.timeLeft() < 40_000) break;
      i++;
      if ((p.status ?? 0) >= 400) continue; // broken pages are reported by the navigation check
      const needsReload = p.signals.pageErrors.length || p.signals.consoleErrors.length || p.signals.failedRequests.length;
      // Re-open every page once: reproduces errors seen during discovery and gives us a live page for evidence.
      const { page, signals: again } = await openPage(bctx, p.url);
      try {
        const same = (a: string) => again.pageErrors.some((e) => normMsg(e.message) === a);
        // ── Uncaught exceptions ──
        for (const e of dedupe(p.signals.pageErrors.map((x) => x.message))) {
          const reproduced = same(normMsg(e));
          const stack = p.signals.pageErrors.find((x) => x.message === e)?.stack;
          await report(ctx, {
            module: 'CONSOLE_NETWORK', category: 'JavaScript error', severity: reproduced ? 'HIGH' : 'MEDIUM', classification: reproduced ? 'CONFIRMED' : 'FLAKY',
            testName: `JavaScript errors on ${pathOf(p.url)}`, pageRec: p, page,
            title: `Uncaught JavaScript error on ${pathOf(p.url)}: ${e.slice(0, 90)}`,
            description: `Loading ${pathOf(p.url)} throws an uncaught exception${reproduced ? ' (reproduced on a second load)' : ' (seen once, not on reload — intermittent)'}. Scripts after the failing line do not run, so parts of the page may not work.\n\n${e}${stack ? `\n${stack}` : ''}`,
            expected: 'The page loads without uncaught JavaScript exceptions.', actual: `Uncaught ${e}`,
            steps: [`Open ${p.url}`, 'Open the browser developer console', 'Observe the uncaught error'],
            signals: { message: e, stack, reproducedOnReload: reproduced }, groupKey: normMsg(e),
            recommendation: 'Fix the failing script (see the stack trace) and guard against missing elements or data before using them.',
          });
        }
        // ── console.error ──
        for (const c of dedupe(p.signals.consoleErrors.map((x) => x.text))) {
          const reproduced = again.consoleErrors.some((x) => normMsg(x.text) === normMsg(c));
          const loc = p.signals.consoleErrors.find((x) => x.text === c)?.location;
          const thirdParty = !!loc && !ctx.gb.isSameSite(loc.split(':').slice(0, -1).join(':'));
          await report(ctx, {
            module: 'CONSOLE_NETWORK', category: 'Console error', severity: thirdParty ? 'LOW' : 'MEDIUM', classification: reproduced ? 'CONFIRMED' : 'FLAKY',
            testName: `Console errors on ${pathOf(p.url)}`, pageRec: p, page,
            title: `Console error on ${pathOf(p.url)}: ${c.slice(0, 90)}`,
            description: `The page logs an error to the browser console${thirdParty ? ' from a third-party script' : ''}${reproduced ? '' : ' (seen once — intermittent)'}:\n${c}${loc ? `\nSource: ${loc}` : ''}`,
            expected: 'No errors in the browser console.', actual: c, steps: [`Open ${p.url}`, 'Open the developer console', 'Observe the error'],
            signals: { message: c, location: loc, reproducedOnReload: reproduced, thirdParty }, groupKey: normMsg(c),
            recommendation: 'Fix the code path that logs the error, or handle the failing call gracefully.',
          });
        }
        // ── Failed requests (excluding the page document itself) ──
        const failed = new Map<string, (typeof p.signals.failedRequests)[number]>();
        for (const f of p.signals.failedRequests) if (f.url !== p.url && f.url !== p.requestedUrl && f.resourceType !== 'document') failed.set(f.url, f);
        for (const f of failed.values()) {
          const stillFails = again.failedRequests.some((x) => x.url === f.url);
          if (!stillFails) continue; // transient — not reported
          const same = ctx.gb.isSameSite(f.url);
          const image = f.resourceType === 'image';
          const critical = f.resourceType === 'script' || f.resourceType === 'stylesheet';
          const what = image ? 'Broken image' : critical ? `Missing ${f.resourceType}` : f.resourceType === 'xhr' || f.resourceType === 'fetch' ? 'Failed API request' : `Failed ${f.resourceType} request`;
          const imgLoc = image ? page.locator(`img[src="${new URL(f.url).pathname}"], img[src="${f.url}"]`).first() : undefined;
          await report(ctx, {
            module: image ? 'IMAGE' : 'CONSOLE_NETWORK', category: what, classification: same ? 'CONFIRMED' : 'NEEDS_REVIEW',
            severity: !same ? 'LOW' : critical || (f.status ?? 0) >= 500 ? 'HIGH' : 'MEDIUM',
            testName: `Resources on ${pathOf(p.url)}`, pageRec: p, page, target: imgLoc,
            title: `${what} on ${pathOf(p.url)}: ${pathOf(f.url).slice(0, 80)} (${f.status ? `HTTP ${f.status}` : f.failure})`,
            description: `${f.method} ${f.url} ${f.status ? `returned HTTP ${f.status}` : `failed (${f.failure})`} on two separate loads of ${pathOf(p.url)}.${image ? ' The image is shown as broken.' : ''}${same ? '' : ' The resource is on a third-party host.'}`,
            expected: 'All page resources load successfully.', actual: f.status ? `HTTP ${f.status}` : (f.failure ?? 'failed'),
            steps: [`Open ${p.url}`, 'Open the developer tools → Network tab', `Find ${pathOf(f.url)}`],
            signals: { url: f.url, status: f.status, failure: f.failure, resourceType: f.resourceType, reproducedOnReload: true }, groupKey: f.url,
            element: image ? { type: 'image', selector: imgLoc ? `img[src*="${new URL(f.url).pathname.split('/').pop()}"]` : 'img', text: pathOf(f.url) } : undefined,
            recommendation: image ? 'Upload the missing image or fix its URL; add width/height and alt text.' : 'Restore the resource or fix the URL that references it.',
          });
        }
        if (!needsReload && !p.signals.failedRequests.length) await pass(ctx, { module: 'CONSOLE_NETWORK', name: `Console & network on ${pathOf(p.url)}`, pageId: p.id, observations: { consoleErrors: 0, pageErrors: 0, failedRequests: 0 } });

        // ── Metadata ──
        const t = p.title.trim();
        if (t) titles.set(t, [...(titles.get(t) ?? []), p]);
        if (!t) await meta(ctx, p, page, 'Missing page title', 'LOW', 'The page has no <title>. Browser tabs, bookmarks and search results show the bare URL.', 'A descriptive <title> element.', 'Add a unique, descriptive <title> to the page.', `title:${p.normalizedUrl}`);
        if (!p.inv.metaDescription && (p.status ?? 200) < 300) await meta(ctx, p, page, 'Missing meta description', 'INFO', 'The page has no <meta name="description">. Search engines will generate their own snippet.', 'A <meta name="description"> summarising the page.', 'Add a concise meta description (about 150 characters).', 'meta-description');
        if (!p.inv.lang) await meta(ctx, p, page, 'Missing page language (html lang)', 'LOW', 'The <html> element has no lang attribute, so screen readers may use the wrong pronunciation.', '<html lang="…"> is set.', 'Add lang="en" (or the correct language) to the <html> element.', 'html-lang', 'ACCESSIBILITY');

        // ── Accessibility basics ──
        const noAlt = p.inv.images.filter((im) => im.visible && !im.hasAlt && !im.decorative);
        if (noAlt.length) {
          await report(ctx, {
            module: 'ACCESSIBILITY', category: 'Image without alt text', severity: 'LOW', classification: 'CONFIRMED', testName: `Image alt text on ${pathOf(p.url)}`, pageRec: p, page, target: page.locator(noAlt[0]!.selector).first(),
            title: `${noAlt.length} image${noAlt.length === 1 ? '' : 's'} without alt text`, description: `Images without an alt attribute are announced by file name to screen-reader users. First one: ${noAlt[0]!.src}`,
            expected: 'Every meaningful image has alt text; decorative images use alt="".', actual: `${noAlt.length} image(s) have no alt attribute on ${pathOf(p.url)}.`,
            steps: [`Open ${p.url}`, `Inspect ${noAlt[0]!.selector}`], signals: { count: noAlt.length, images: noAlt.slice(0, 10).map((x) => x.src) }, groupKey: 'img-alt',
            element: { type: 'image', selector: noAlt[0]!.selector, text: noAlt[0]!.src }, recommendation: 'Add descriptive alt text to content images and alt="" to decorative ones.',
          });
        }
        for (const f of p.inv.inputsNoLabel.slice(0, 5)) {
          await report(ctx, {
            module: 'ACCESSIBILITY', category: 'Form field without label', severity: 'MEDIUM', classification: 'CONFIRMED', testName: `Field labels on ${pathOf(p.url)}`, pageRec: p, page, target: page.locator(f.selector).first(),
            title: `Form field ${f.name ? `"${f.name}"` : `(${f.type})`} has no accessible label`, description: `The ${f.type} field ${f.selector} has no <label>, aria-label or placeholder, so assistive technology cannot tell users what to enter.`,
            expected: 'Each form field has a visible label linked to it.', actual: 'No label, aria-label, aria-labelledby or placeholder.', steps: [`Open ${p.url}`, `Inspect ${f.selector}`],
            signals: f, groupKey: `nolabel:${f.selector}`, element: { type: 'input', selector: f.selector, text: f.name }, recommendation: 'Add a <label for="…"> (or aria-label) to the field.',
          });
        }
        for (const b of p.inv.buttonsNoName.slice(0, 5)) {
          await report(ctx, {
            module: 'ACCESSIBILITY', category: 'Control without accessible name', severity: 'MEDIUM', classification: 'CONFIRMED', testName: `Control names on ${pathOf(p.url)}`, pageRec: p, page, target: page.locator(b.selector).first(),
            title: `A ${b.tag === 'a' ? 'link' : 'button'} has no accessible name`, description: `${b.selector} has no text, aria-label or title. Screen readers announce it only as "${b.tag === 'a' ? 'link' : 'button'}".`,
            expected: 'Every button and link has a text or aria-label.', actual: 'No accessible name.', steps: [`Open ${p.url}`, `Inspect ${b.selector}`],
            signals: b, groupKey: `noname:${b.selector}`, element: { type: b.tag, selector: b.selector }, recommendation: 'Add visible text or an aria-label describing the action.',
          });
        }
        const lowContrast = (await page.evaluate('window.__awt.contrast()').catch(() => [])) as Contrast[];
        const byPair = new Map<string, Contrast[]>();
        for (const c of lowContrast) byPair.set(`${c.color}|${c.background}`, [...(byPair.get(`${c.color}|${c.background}`) ?? []), c]);
        for (const [pair, list] of byPair) {
          const c = list[0]!;
          await report(ctx, {
            module: 'ACCESSIBILITY', category: 'Low text contrast', severity: 'LOW', classification: 'CONFIRMED', testName: `Text contrast on ${pathOf(p.url)}`, pageRec: p, page, target: page.locator(c.selector).first(),
            title: `Low text contrast (${c.ratio}:1) — ${quote(c.text, 40)}`, description: `Text in ${c.color} on ${c.background} has a contrast ratio of ${c.ratio}:1; WCAG AA requires ${c.required}:1 for ${c.fontSize}px text. ${list.length} element(s) on ${pathOf(p.url)} use this colour pair.`,
            expected: `Contrast of at least ${c.required}:1.`, actual: `${c.ratio}:1`, steps: [`Open ${p.url}`, `Inspect ${c.selector}`],
            signals: { ...c, elements: list.length }, groupKey: `contrast:${pair}`, element: { type: 'text', selector: c.selector, text: c.text }, recommendation: 'Darken the text or lighten the background until the ratio meets WCAG AA.',
          });
        }
        // ── Security / performance ──
        const insecure = [...new Set(p.signals.insecureRequests)];
        if (insecure.length) {
          await report(ctx, {
            module: 'CONSOLE_NETWORK', category: 'Mixed content', severity: 'MEDIUM', classification: 'CONFIRMED', testName: `Mixed content on ${pathOf(p.url)}`, pageRec: p, page,
            title: `Insecure (http) resources on an https page: ${pathOf(p.url)}`, description: `The https page loads ${insecure.length} resource(s) over plain http, e.g. ${insecure[0]}. Browsers block or warn about mixed content.`,
            expected: 'All resources are loaded over https.', actual: `${insecure.length} http resource(s).`, steps: [`Open ${p.url}`, 'Developer tools → Console → mixed-content warnings'],
            signals: { insecure: insecure.slice(0, 10) }, groupKey: `mixed:${p.normalizedUrl}`, recommendation: 'Serve those resources over https (or use protocol-relative/https URLs).',
          });
        }
        if (p.loadTimeMs > 8_000) {
          await report(ctx, {
            module: 'CONSOLE_NETWORK', category: 'Slow page', severity: 'LOW', classification: 'NEEDS_REVIEW', testName: `Load time ${pathOf(p.url)}`, pageRec: p, page,
            title: `${pathOf(p.url)} took ${(p.loadTimeMs / 1000).toFixed(1)} s to load`, description: `During testing the page needed ${(p.loadTimeMs / 1000).toFixed(1)} s to reach the load event. Network conditions vary, so please confirm with a performance tool.`,
            expected: 'The page loads in under ~3 seconds.', actual: `${p.loadTimeMs} ms`, steps: [`Open ${p.url}`, 'Measure load time'],
            signals: { loadTimeMs: p.loadTimeMs }, groupKey: `slow:${p.normalizedUrl}`, recommendation: 'Optimise images, defer non-critical scripts and enable caching/compression.',
          });
        }
      } finally {
        await page.close().catch(() => undefined);
      }
      if (i % 5 === 0) await ctx.stage('technical', `Checked ${i} of ${pages.length} pages for technical errors`, { done: i, total: pages.length });
    }
    // Duplicate titles across distinct pages.
    for (const [t, ps] of titles) {
      if (ps.length < 2 || ps.some((x) => (x.status ?? 200) >= 400)) continue;
      const { page } = await openPage(bctx, ps[0]!.url);
      await report(ctx, {
        module: 'FUNCTIONAL', category: 'Duplicate page title', severity: 'INFO', classification: 'CONFIRMED', testName: `Unique title "${t}"`, pageRec: ps[0]!, page,
        title: `${ps.length} pages share the title "${t.slice(0, 60)}"`, description: `These pages all use the same <title>: ${ps.slice(0, 10).map((x) => pathOf(x.url)).join(', ')}. Users and search engines can't tell them apart.`,
        expected: 'Each page has a unique title.', actual: `${ps.length} pages titled "${t}".`, steps: ps.slice(0, 3).map((x) => `Open ${x.url} and read the browser tab title`),
        signals: { title: t, pages: ps.map((x) => x.url) }, groupKey: `dup-title:${t}`, recommendation: 'Give each page a specific title, e.g. "Laptops – Acme Store".',
      });
      await page.close();
    }
  } finally {
    await bctx.close().catch(() => undefined);
  }
}

async function meta(ctx: RunCtx, p: CrawledPage, page: Page, title: string, severity: 'LOW' | 'INFO', description: string, expected: string, recommendation: string, groupKey: string, module: 'FUNCTIONAL' | 'ACCESSIBILITY' = 'FUNCTIONAL') {
  await report(ctx, {
    module, category: title, severity, classification: 'CONFIRMED', testName: `${title} — ${pathOf(p.url)}`, pageRec: p, page, title, description, expected,
    actual: 'Not present.', steps: [`Open ${p.url}`, 'View the page source'], signals: { present: false, url: p.url }, groupKey, recommendation,
  });
}

function dedupe(list: string[]) {
  const seen = new Set<string>();
  return list.filter((m) => {
    const k = normMsg(m);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
