// Verifies the browser-level planted bugs really render (overlap, misalignment,
// overflow, dead buttons, console errors, SPA soft-404) and that controls work.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { start } from '../server.mjs';

let server, base, browser;

before(async () => {
  server = start(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server.close();
});

async function open(path, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return { page, ctx, errors };
}

const box = (page, sel) => page.locator(sel).first().boundingBox();
const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('FX-001 sale badge overlaps hero title', async () => {
  const { page, ctx } = await open('/');
  assert.ok(intersects(await box(page, '.sale-badge'), await box(page, '.hero-title')));
  await ctx.close();
});

test('FX-002 misaligned card; FX-005 inconsistent gap', async () => {
  const { page, ctx } = await open('/');
  const cards = await page.locator('.card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  assert.equal(Math.round(cards[1].y - cards[0].y), 23);
  const gapNormal = Math.round(cards[1].x - (cards[0].x + cards[0].width));
  const gapTight = Math.round(cards[3].x - (cards[2].x + cards[2].width));
  assert.equal(gapNormal, 24);
  assert.equal(gapTight, 4);
  await ctx.close();
});

test('FX-003 broken image has naturalWidth 0; others load', async () => {
  const { page, ctx } = await open('/');
  const widths = await page.locator('.card img').evaluateAll((imgs) => imgs.map((i) => [i.getAttribute('src'), i.naturalWidth]));
  for (const [src, w] of widths) assert.equal(w === 0, src === '/static/headphones.png', src);
  await ctx.close();
});

async function mutationsAfterClick(page, sel) {
  // Count only *effective* mutations: attribute writes that leave the value unchanged
  // (e.g. a global "close menus" handler re-setting aria-expanded="false") are not an action.
  await page.evaluate(() => {
    window.__m = 0;
    new MutationObserver((list) => {
      for (const r of list) {
        if (r.type === 'attributes' && r.oldValue === r.target.getAttribute(r.attributeName)) continue;
        window.__m++;
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  });
  let requests = 0;
  page.on('request', () => requests++);
  const url = page.url();
  await page.click(sel);
  await page.waitForTimeout(500);
  return { mutations: await page.evaluate(() => window.__m), requests, navigated: page.url() !== url };
}

test('FX-004 subscribe button is dead; control promo button works', async () => {
  const { page, ctx } = await open('/');
  assert.deepEqual(await mutationsAfterClick(page, '#subscribe-btn'), { mutations: 0, requests: 0, navigated: false });
  assert.ok((await mutationsAfterClick(page, '#promo-btn')).mutations > 0);
  await ctx.close();
});

test('FX-006 spec table overflows on mobile but not desktop', async () => {
  for (const [vp, expectOverflow] of [[{ width: 1280, height: 800 }, false], [{ width: 375, height: 812 }, true], [{ width: 768, height: 1024 }, true]]) {
    const { page, ctx } = await open('/products/laptops', vp);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, expectOverflow, `width ${vp.width}`);
    await ctx.close();
  }
});

test('FX-015 product page throws; control add-to-cart still works', async () => {
  const { page, ctx, errors } = await open('/products/laptops');
  assert.ok(errors.some((e) => /items/.test(e)));
  await page.click('#add-to-cart');
  assert.equal(await page.textContent('#cart-status'), '1 item(s) in cart');
  await ctx.close();
});

test('FX-022 nav overlaps logo on mobile/tablet only', async () => {
  for (const [vp, expected] of [[{ width: 1280, height: 800 }, false], [{ width: 768, height: 1024 }, true], [{ width: 375, height: 812 }, true]]) {
    const { page, ctx } = await open('/', vp);
    assert.equal(intersects(await box(page, '.logo'), await box(page, '.mainnav')), expected, `width ${vp.width}`);
    await ctx.close();
  }
});

test('dropdown reveals FX-007 link only after opening', async () => {
  const { page, ctx } = await open('/');
  const link = page.locator('.dropdown-menu a[href="/products/tablets"]');
  assert.equal(await link.isVisible(), false);
  await page.click('.dropdown-toggle');
  assert.equal(await link.isVisible(), true);
  await ctx.close();
});

test('SPA routes via buttons; FX-021 billing is soft-404', async () => {
  const { page, ctx } = await open('/app');
  await page.click('button[data-route="/app/reports"]');
  assert.equal(new URL(page.url()).pathname, '/app/reports');
  assert.equal(await page.textContent('#spa-view h1'), 'Reports');
  await page.click('button[data-route="/app/billing"]');
  assert.equal(await page.textContent('#spa-view h1'), 'Route not found');
  await ctx.close();
});
