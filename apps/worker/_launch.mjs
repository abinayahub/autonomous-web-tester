import { chromium } from 'playwright';
for (let i = 1; i <= 3; i++) {
  const t = Date.now();
  try {
    const b = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-default-browser-check'] });
    const p = await b.newPage();
    await p.setContent('<h1>ok</h1>');
    console.log(`launch ${i}: OK v${b.version()} in ${Date.now() - t} ms, page text: ${await p.textContent('h1')}`);
    await b.close();
  } catch (e) {
    const m = e.message;
    console.log(`launch ${i}: FAILED after ${Date.now() - t} ms`);
    console.log(m.split('\n').filter((l) => !l.includes('<launching>')).slice(0, 25).join('\n'));
  }
}
