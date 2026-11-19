import type { ViewportProfile } from '@awt/shared';
import { INPAGE_SCRIPT } from '../inpage.js';
import type { CrawledPage, RunCtx } from '../types.js';
import { pathOf } from '../url.js';
import { openPage, pass, quote, report } from './common.js';

interface Layout {
  vw: number;
  docW: number;
  overflow: Array<{ selector: string; tag: string; text: string; right: number; width: number }>;
  overlaps: Array<{ cover: { selector: string; tag: string; text: string; landmark: string }; covered: { selector: string; tag: string; text: string; landmark: string }; overlapPx: number; overlapPct: number }>;
  misaligned: Array<{ selector: string; text: string; offsetPx: number; rowTop: number; siblings: number; container: string }>;
  spacing: Array<{ container: string; gaps: number[]; between: string[]; text: string }>;
}

type Hit<T> = { page: CrawledPage; vp: ViewportProfile; item: T; docW: number; vw: number };

const vpList = (vs: ViewportProfile[]) => vs.map((v) => `${v.label} (${v.width}px)`).join(', ');

/** Responsive overflow + overlapping elements at every viewport; row alignment and spacing at desktop width. */
export async function checkLayout(ctx: RunCtx, pages: CrawledPage[], role?: string) {
  const overflow = new Map<string, Hit<Layout['overflow'][number]>[]>();
  const overlaps = new Map<string, Hit<Layout['overlaps'][number]>[]>();
  const misaligned = new Map<string, Hit<Layout['misaligned'][number]>[]>();
  const spacing = new Map<string, Hit<Layout['spacing'][number]>[]>();
  const add = <T>(m: Map<string, Hit<T>[]>, k: string, h: Hit<T>) => m.set(k, [...(m.get(k) ?? []), h]);
  const targets = pages.filter((p) => (p.status ?? 200) < 400);
  const state = role ? ctx.sessions.get(role) : undefined;

  for (const vp of ctx.s.viewports) {
    ctx.checkpoint();
    if (ctx.timeLeft() < 60_000) break;
    const bctx = await ctx.gb.newContext(vp, state);
    await bctx.addInitScript(INPAGE_SCRIPT);
    try {
      for (const p of targets) {
        ctx.checkpoint();
        if (ctx.timeLeft() < 50_000) break;
        const { page } = await openPage(bctx, p.url);
        try {
          await page.evaluate('document.fonts ? document.fonts.ready : null').catch(() => undefined);
          const l = (await page.evaluate(`window.__awt.layout(${JSON.stringify({ rows: vp.deviceClass === 'DESKTOP' })})`)) as Layout;
          // Group site-wide: a shared template element (header, spec table, tab bar) is one issue listing every affected page.
          for (const o of l.overflow.slice(0, 1)) add(overflow, `${o.tag}|${o.selector}`, { page: p, vp, item: o, docW: l.docW, vw: l.vw });
          for (const o of l.overlaps) add(overlaps, `${o.cover.landmark || `${o.cover.tag}:${o.cover.text}`}|${o.covered.tag}:${o.covered.text}`, { page: p, vp, item: o, docW: l.docW, vw: l.vw });
          for (const m of l.misaligned) add(misaligned, `${m.container}|${m.selector}`, { page: p, vp, item: m, docW: l.docW, vw: l.vw });
          for (const s of l.spacing) add(spacing, `${s.container}|${s.gaps.join(',')}`, { page: p, vp, item: s, docW: l.docW, vw: l.vw });
          if (!l.overflow.length && !l.overlaps.length) await pass(ctx, { module: 'RESPONSIVE', name: `Layout ${pathOf(p.url)} @ ${vp.label}`, pageId: p.id, viewportId: vp.id, deviceClass: vp.deviceClass, observations: { docWidth: l.docW, viewportWidth: l.vw } });
        } catch (e) {
          await pass(ctx, { module: 'RESPONSIVE', name: `Layout ${pathOf(p.url)} @ ${vp.label}`, pageId: p.id, viewportId: vp.id, status: 'ERROR', error: (e as Error).message.split('\n')[0] });
        } finally {
          await page.close().catch(() => undefined);
        }
      }
    } finally {
      await bctx.close().catch(() => undefined);
    }
    await ctx.stage('responsive', `Checked ${targets.length} pages at ${vp.label}`, { viewport: vp.id });
  }

  // Evidence is captured at the narrowest affected viewport, after grouping.
  const evidencePage = async (vp: ViewportProfile, url: string) => {
    const bctx = await ctx.gb.newContext(vp, state);
    await bctx.addInitScript(INPAGE_SCRIPT);
    const { page } = await openPage(bctx, url);
    return { page, close: () => bctx.close().catch(() => undefined) };
  };

  for (const [key, hits] of overflow) {
    const vps = [...new Map(hits.map((h) => [h.vp.id, h.vp])).values()].sort((a, b) => a.width - b.width);
    const h = hits.find((x) => x.vp.id === vps[0]!.id)!;
    const { page, close } = await evidencePage(h.vp, h.page.url);
    await report(ctx, {
      module: 'RESPONSIVE', category: 'Horizontal overflow', severity: vps.some((v) => v.deviceClass === 'MOBILE') ? 'MEDIUM' : 'LOW', classification: 'CONFIRMED',
      testName: `Horizontal overflow ${pathOf(h.page.url)}`, pageRec: h.page, page, target: page.locator(h.item.selector).first(), viewportId: h.vp.id, deviceClass: h.vp.deviceClass,
      title: `${pathOf(h.page.url)} scrolls sideways on ${vps.map((v) => v.deviceClass.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(' and ')}: ${quote(h.item.text || h.item.tag, 30)} is wider than the screen`,
      description: `At ${vpList(vps)} the page is ${h.docW}px wide on a ${h.vw}px screen. ${h.item.tag} ${h.item.selector} extends to ${h.item.right}px, forcing horizontal scrolling.`,
      expected: 'Content fits the viewport width; no horizontal scrolling.', actual: `Document width ${h.docW}px > viewport ${h.vw}px.`,
      steps: [`Open ${h.page.url} at ${h.vw}px width (e.g. a ${h.vp.deviceClass.toLowerCase()})`, 'Scroll sideways', `Observe ${h.item.selector} overflowing`],
      signals: { viewports: vps.map((v) => v.id), documentWidth: h.docW, viewportWidth: h.vw, element: h.item, pages: [...new Set(hits.map((x) => x.page.url))] }, groupKey: key,
      element: { type: h.item.tag, selector: h.item.selector, text: h.item.text }, recommendation: 'Let the element wrap or shrink (max-width: 100%, overflow-x: auto for tables, flexible widths) at narrow screens.',
    });
    for (const extra of [...new Set(hits.map((x) => x.page.url))].filter((u) => u !== h.page.url)) {
      await ctx.rec.issue({ ...(await groupedStub(ctx, hits.find((y) => y.page.url === extra)!.page, key, 'RESPONSIVE', 'Horizontal overflow')) });
    }
    await close();
  }
  for (const [key, hits] of overlaps) {
    const vps = [...new Map(hits.map((h) => [h.vp.id, h.vp])).values()].sort((a, b) => a.width - b.width);
    const h = hits[0]!;
    const evVp = vps[0]!;
    const evHit = hits.find((x) => x.vp.id === evVp.id)!;
    const pagesHit = [...new Set(hits.map((x) => x.page.url))];
    const { page, close } = await evidencePage(evVp, evHit.page.url);
    const onlySmall = !vps.some((v) => v.deviceClass === 'DESKTOP');
    await report(ctx, {
      module: onlySmall ? 'RESPONSIVE' : 'UI_LAYOUT', category: 'Overlapping elements', severity: 'MEDIUM', classification: 'CONFIRMED',
      testName: `Overlap ${pathOf(evHit.page.url)} @ ${evVp.label}`, pageRec: evHit.page, page, target: page.locator(evHit.item.covered.selector).first(), viewportId: evVp.id, deviceClass: evVp.deviceClass,
      title: `${quote(h.item.cover.text || h.item.cover.tag, 30)} overlaps ${quote(h.item.covered.text || h.item.covered.tag, 30)}${onlySmall ? ` below ${Math.max(...vps.map((v) => v.width)) + 1}px` : ''}`,
      description: `${h.item.cover.tag} ${h.item.cover.selector} is drawn on top of ${h.item.covered.tag} ${h.item.covered.selector}, hiding ${h.item.overlapPct}% of it (${h.item.overlapPx}px²). Seen at ${vpList(vps)}${pagesHit.length > 1 ? ` on ${pagesHit.length} pages` : ''}. Verified with a hit-test: the covering element is the one on top at the overlap.`,
      expected: 'Elements do not cover each other; text stays fully readable and clickable.', actual: `${h.item.overlapPct}% of ${quote(h.item.covered.text || h.item.covered.tag)} is hidden.`,
      steps: [`Open ${evHit.page.url} at ${evVp.width}px width`, `Look at ${quote(h.item.covered.text || h.item.covered.selector)}`],
      signals: { viewports: vps.map((v) => v.id), ...h.item, pages: pagesHit }, groupKey: key,
      element: { type: h.item.covered.tag, selector: h.item.covered.selector, text: h.item.covered.text },
      recommendation: onlySmall ? 'Add a breakpoint so the elements stack or collapse (e.g. a menu button) at narrow widths.' : 'Remove the negative margin / absolute offset, or reserve space so the elements no longer overlap.',
    });
    for (const extra of pagesHit.slice(1)) {
      const x = hits.find((y) => y.page.url === extra)!;
      await ctx.rec.issue({ ...(await groupedStub(ctx, x.page, key, onlySmall ? 'RESPONSIVE' : 'UI_LAYOUT', 'Overlapping elements')) });
    }
    await close();
  }
  for (const hits of misaligned.values()) {
    const h = hits[0]!;
    const { page, close } = await evidencePage(h.vp, h.page.url);
    await report(ctx, {
      module: 'UI_LAYOUT', category: 'Misaligned element', severity: 'LOW', classification: 'CONFIRMED', testName: `Row alignment ${pathOf(h.page.url)}`, pageRec: h.page, page,
      target: page.locator(h.item.selector).first(), viewportId: h.vp.id, deviceClass: h.vp.deviceClass,
      title: `${quote(h.item.text || 'An item', 30)} is ${Math.abs(h.item.offsetPx)}px ${h.item.offsetPx > 0 ? 'lower' : 'higher'} than the other items in its row`,
      description: `In ${h.item.container} there are ${h.item.siblings} equal-width items in one row; all but this one share the same top edge (y = ${h.item.rowTop}px). This one is offset by ${h.item.offsetPx}px.`,
      expected: 'Items in the same row are top-aligned.', actual: `Offset ${h.item.offsetPx}px.`, steps: [`Open ${h.page.url} at ${h.vp.width}px`, `Compare ${quote(h.item.text)} with its neighbours`],
      signals: h.item, groupKey: `${h.page.normalizedUrl}|${h.item.selector}`, element: { type: 'element', selector: h.item.selector, text: h.item.text },
      recommendation: 'Remove the extra margin/position offset on this item (or use align-items: start on the row).',
    });
    await close();
  }
  for (const hits of spacing.values()) {
    const h = hits[0]!;
    const { page, close } = await evidencePage(h.vp, h.page.url);
    await report(ctx, {
      module: 'UI_LAYOUT', category: 'Inconsistent spacing', severity: 'LOW', classification: 'CONFIRMED', testName: `Row spacing ${pathOf(h.page.url)}`, pageRec: h.page, page,
      target: page.locator(h.item.container).first(), viewportId: h.vp.id, deviceClass: h.vp.deviceClass,
      title: `Uneven spacing between items in a row (${h.item.gaps.join('px, ')}px)`, description: `Equal-width items in ${h.item.container} are separated by different gaps: ${h.item.gaps.join('px, ')}px (smallest between ${h.item.text}).`,
      expected: 'Consistent gaps between items in the same row.', actual: `Gaps of ${h.item.gaps.join('px, ')}px.`, steps: [`Open ${h.page.url} at ${h.vp.width}px`, 'Compare the gaps between the cards'],
      signals: h.item, groupKey: `${h.item.container}|${h.item.gaps.join(',')}`, element: { type: 'container', selector: h.item.container },
      recommendation: 'Use one gap value (e.g. CSS gap on the flex/grid container) instead of per-item margins.',
    });
    await close();
  }
}

/** Adds another affected page to an already-reported overlap group (no extra screenshot needed). */
async function groupedStub(_ctx: RunCtx, p: CrawledPage, key: string, module: 'RESPONSIVE' | 'UI_LAYOUT', category: string) {
  return {
    module, category, title: '', description: '', severity: 'MEDIUM' as const, classification: 'CONFIRMED' as const,
    expected: '', actual: '', steps: [], pageUrl: p.url, signals: { grouped: true }, groupKey: key, evidence: [], recommendation: '',
  };
}
