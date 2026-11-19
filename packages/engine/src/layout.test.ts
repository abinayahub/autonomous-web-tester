import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { INPAGE_SCRIPT } from './inpage.js';
import { launchChromium } from './launch.js';

let browser: Browser;
beforeAll(async () => {
  browser = await launchChromium();
}, 60_000);
afterAll(async () => {
  await browser?.close();
}, 30_000);

async function overlaps(html: string, width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: 700 } });
  await page.setContent(`<!doctype html><html><body style="margin:0;font:16px sans-serif">${html}</body></html>`);
  await page.evaluate(INPAGE_SCRIPT); // setContent does not run init scripts
  const r = (await page.evaluate('window.__awt.layout({ rows: false })')) as { overlaps: Array<{ cover: { text: string }; covered: { text: string } }> };
  await page.close();
  return r.overlaps.map((o) => `${o.cover.text} / ${o.covered.text}`);
}

const longContent = Array.from({ length: 40 }, (_, i) => `<p style="margin:0 24px 24px">Paragraph ${i} with some readable body text for the overlap check.</p>`).join('');

describe('overlap detection', () => {
  it('ignores a sticky header floating over scrolled content (by design, not a bug)', async () => {
    const html = `<header style="position:sticky;top:0;background:#fff;padding:16px 24px;display:flex;gap:24px"><a href="#">How it works</a><a href="#">Support</a></header>${longContent}`;
    expect(await overlaps(html)).toEqual([]);
  });

  it('ignores a fixed header too', async () => {
    const html = `<header style="position:fixed;top:0;left:0;right:0;background:#fff;padding:16px 24px"><a href="#">Owner Hub</a></header><div style="padding-top:60px">${longContent}</div>`;
    expect(await overlaps(html)).toEqual([]);
  });

  it('still detects a badge drawn over a heading', async () => {
    const html = `<div style="position:relative;padding:32px"><h1 style="margin:0">Everything you need, delivered</h1><span style="position:absolute;top:36px;left:120px;background:#e11d48;color:#fff;padding:8px 14px">SALE -40%</span></div>`;
    const found = await overlaps(html);
    expect(found.some((f) => f.includes('SALE -40%') && f.includes('Everything you need'))).toBe(true);
  });

  it('still detects items inside a sticky header overlapping each other', async () => {
    const html = `<header style="position:sticky;top:0;background:#fff;height:56px"><a href="#" style="position:absolute;left:20px;top:16px;font-size:20px;font-weight:700">Acme Store</a><nav style="position:absolute;left:60px;top:18px"><a href="#">Home</a></nav></header>${longContent}`;
    const found = await overlaps(html);
    expect(found.some((f) => f.includes('Acme Store') && f.includes('Home'))).toBe(true);
  });
});
