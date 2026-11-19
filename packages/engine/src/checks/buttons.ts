import type { BrowserContext, Page } from 'playwright';
import { newPageContext } from '../crawl.js';
import { classifyAction } from '../risk.js';
import type { ButtonInfo, CrawledPage, RunCtx } from '../types.js';
import { normalizeUrl, pathOf } from '../url.js';
import { SOFT_404, openPage, pass, quote, report } from './common.js';

interface Snap { mutations: number; url: string; scrollY: number; active: string; text: number; visible: number }
const snap = (page: Page) => page.evaluate('window.__awt.snapshot()') as Promise<Snap>;

interface Effect {
  any: boolean;
  mutations: number;
  idleMutations: number;
  urlChanged: boolean;
  newUrl: string;
  requests: number;
  blockedRequests: number;
  dialogs: number;
  visibleChange: number;
  scrolled: boolean;
  focusMoved: boolean;
  newErrors: string[];
  clickError?: string;
}

async function clickAndObserve(ctx: RunCtx, bctx: BrowserContext, url: string, b: ButtonInfo, waitMs: number): Promise<{ effect: Effect; page: Page }> {
  const { page, signals } = await openPage(bctx, url);
  // Baseline: how much the page changes on its own (carousels, timers).
  const s0 = await snap(page);
  await page.waitForTimeout(600);
  const s1 = await snap(page);
  const idle = Math.max(0, s1.mutations - s0.mutations);
  let requests = 0;
  const onReq = () => requests++;
  page.on('request', onReq);
  const netIdx = ctx.gb.net.length;
  const errIdx = signals.pageErrors.length;
  const dlgIdx = signals.dialogs.length;
  let clickError: string | undefined;
  try {
    await page.locator(b.selector).first().click({ timeout: 4_000 });
  } catch (e) {
    clickError = (e as Error).message.split('\n')[0];
  }
  await page.waitForTimeout(waitMs);
  await page.waitForLoadState('networkidle', { timeout: 1_500 }).catch(() => undefined);
  page.off('request', onReq);
  const s2 = await snap(page).catch(() => ({ ...s1, url: page.url() }));
  const blocked = ctx.gb.net.slice(netIdx).filter((r) => r.blocked).length;
  const mutations = Math.max(0, s2.mutations - s1.mutations);
  const effect: Effect = {
    mutations, idleMutations: idle, urlChanged: s2.url !== s1.url, newUrl: s2.url, requests, blockedRequests: blocked, dialogs: signals.dialogs.length - dlgIdx, visibleChange: s2.visible - s1.visible,
    scrolled: Math.abs(s2.scrollY - s1.scrollY) > 20, focusMoved: !!s2.active && s2.active !== s1.active && s2.active !== b.selector && !/^body$/i.test(s2.active),
    newErrors: signals.pageErrors.slice(errIdx).map((e) => e.message), clickError, any: false,
  };
  effect.any = effect.urlChanged || effect.requests > 0 || effect.blockedRequests > 0 || effect.dialogs > 0 || effect.scrolled || effect.focusMoved || effect.visibleChange !== 0 || mutations > idle * 1.5 + 2;
  return { effect, page };
}

/** Clicks every safe, visible button (not form submits — the form check covers those) and verifies it does something. */
export async function checkButtons(ctx: RunCtx, pages: CrawledPage[], role?: string) {
  const { bctx } = await newPageContext(ctx, role);
  const tested = new Set<string>();
  let total = 0;
  try {
    for (const p of pages) {
      ctx.checkpoint();
      if (ctx.timeLeft() < 60_000) break;
      if ((p.status ?? 200) >= 400) continue;
      const candidates = p.inv.buttons.filter((b) => !b.isFormSubmit && !b.disabled).slice(0, 15);
      for (const b of candidates) {
        ctx.checkpoint();
        if (ctx.timeLeft() < 45_000 || total >= 150) break;
        // Header/nav/footer controls repeat on every page: test them once site-wide, by label.
        const key = b.inChrome && b.text ? `chrome|${b.tag}|${b.text}` : `${b.selector}|${b.text}`;
        if (tested.has(key)) continue; // shared header/footer controls are tested once
        tested.add(key);
        total++;
        const name = `Button ${quote(b.text || b.selector, 40)} on ${pathOf(p.url)}`;
        const risk = classifyAction(b.text, `${b.dataRoute} ${b.type}`);
        if (risk.risk === 'DESTRUCTIVE') {
          const el = await ctx.rec.element(p.id, { elementType: 'button', selector: b.selector, text: b.text, risk: 'DESTRUCTIVE', riskReason: risk.reason });
          await ctx.rec.testCase({ module: 'BUTTON', name, status: 'BLOCKED', pageId: p.id, elementId: el.id, observations: { reason: risk.reason } });
          continue;
        }
        let { effect, page } = await clickAndObserve(ctx, bctx, p.url, b, 1_200);
        let attempts = 1;
        if (effect.clickError && !effect.any) {
          await page.close();
          // Not clickable (hidden, covered, detached) — can't conclude anything about the button's behaviour.
          await pass(ctx, { module: 'BUTTON', name, pageId: p.id, status: 'SKIPPED', observations: { ...effect }, error: effect.clickError });
          continue;
        }
        if (!effect.any) {
          await page.close();
          attempts = 2;
          ({ effect, page } = await clickAndObserve(ctx, bctx, p.url, b, 2_500));
        }
        try {
          if (effect.newErrors.length) {
            await report(ctx, {
              module: 'BUTTON', category: 'Error on click', severity: 'HIGH', classification: 'CONFIRMED', testName: name, pageRec: p, page, target: page.locator(b.selector).first(),
              title: `Clicking ${quote(b.text || b.selector, 40)} throws a JavaScript error`, description: `Clicking the button raised: ${effect.newErrors[0]}`,
              expected: 'Clicking the button runs without errors.', actual: effect.newErrors.join('\n'), steps: [`Open ${p.url}`, `Click ${quote(b.text || b.selector)}`, 'Open the console'],
              signals: { ...effect }, groupKey: `clickerror:${key}`, element: { type: 'button', selector: b.selector, text: b.text, risk: risk.risk },
              recommendation: 'Fix the click handler (see the error message) so it does not throw.',
            });
          }
          if (!effect.any) {
            await report(ctx, {
              module: 'BUTTON', category: 'Unresponsive button', severity: 'MEDIUM', classification: 'CONFIRMED', testName: name, pageRec: p, page, target: page.locator(b.selector).first(),
              title: `Button ${quote(b.text || b.selector, 40)} does nothing when clicked`,
              description: `The button was clicked twice on fresh page loads (waiting 1.2 s and 2.5 s). Nothing observable happened: no page or route change, no network request, no dialog, no change to the page content (${effect.mutations} DOM changes vs ${effect.idleMutations} while idle), no element appeared or disappeared, no scroll and no focus change.`,
              expected: `Clicking ${quote(b.text || 'the button')} performs its action or shows feedback.`, actual: 'No observable reaction.',
              steps: [`Open ${p.url}`, `Click the ${quote(b.text || b.selector)} button`, 'Observe that nothing happens'],
              signals: { ...effect, attempts }, groupKey: key, element: { type: 'button', selector: b.selector, text: b.text, risk: risk.risk },
              recommendation: 'Attach the missing click handler (or link), or disable/remove the button and show why it is unavailable.',
            });
          } else {
            // SPA navigation to a route that renders "not found".
            if (effect.urlChanged) {
              const h = ((await page.locator('h1').first().textContent({ timeout: 1_000 }).catch(() => '')) ?? '') + ' ' + (await page.title().catch(() => ''));
              if (SOFT_404.test(h)) {
                await report(ctx, {
                  module: 'NAVIGATION', category: 'Soft 404', severity: 'MEDIUM', classification: 'CONFIRMED', testName: `${name} → route`, pageRec: p, page, target: page.locator('h1').first(),
                  title: `${quote(b.text || b.selector, 40)} opens ${pathOf(effect.newUrl)}, which shows "not found"`,
                  description: `Clicking ${quote(b.text || b.selector)} navigates (client-side) to ${pathOf(effect.newUrl)}, which renders ${quote(h.trim())}.`,
                  expected: 'The route renders its screen.', actual: `${quote(h.trim())} at ${pathOf(effect.newUrl)}`,
                  steps: [`Open ${p.url}`, `Click ${quote(b.text || b.selector)}`, 'Observe the "not found" view'], signals: { ...effect, heading: h.trim() }, groupKey: normalizeUrl(effect.newUrl) ?? effect.newUrl,
                  element: { type: 'button', selector: b.selector, text: b.text }, recommendation: 'Implement the route or remove the control that links to it.',
                });
                continue;
              }
            }
            const el = await ctx.rec.element(p.id, { elementType: 'button', selector: b.selector, text: b.text, risk: risk.risk === 'MUTATING' ? 'MUTATING' : 'SAFE', riskReason: risk.reason });
            await ctx.rec.testCase({ module: 'BUTTON', name, status: 'PASSED', pageId: p.id, elementId: el.id, attempts, observations: { ...effect } as never });
          }
        } finally {
          await page.close().catch(() => undefined);
        }
      }
      await ctx.stage('buttons', `Tested ${total} buttons`, { tested: total });
    }
  } finally {
    await bctx.close().catch(() => undefined);
  }
}
