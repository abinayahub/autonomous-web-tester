// Verifies that the fixture really exhibits the bugs it claims (HTTP-level ones)
// and that the controls behave correctly. Browser-level bugs are verified by the
// engine's own E2E tests in Phase 3.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { start } from '../server.mjs';

const manifest = JSON.parse(readFileSync(new URL('../known-bugs.json', import.meta.url), 'utf8'));
let server;
let base;

before(async () => {
  server = start(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const get = (p, opts = {}) => fetch(base + p, { redirect: 'manual', ...opts });

async function login(email, password) {
  const res = await get('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password, next: '/dashboard' }),
  });
  return res.headers.get('set-cookie')?.split(';')[0];
}

test('manifest ids are unique and sequential', () => {
  const ids = manifest.bugs.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id, i) => assert.equal(id, `FX-${String(i + 1).padStart(3, '0')}`));
});

test('every bug is marked in the source', () => {
  const src = ['server.mjs', 'site/static/site.css', 'site/static/product.js', 'site/static/spa.js']
    .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
    .join('\n');
  for (const b of manifest.bugs) assert.ok(src.includes(`BUG:${b.id}`), `${b.id} has no BUG marker`);
});

test('public pages return 200', async () => {
  for (const p of manifest.discovery.public) assert.equal((await get(p)).status, 200, p);
});

test('FX-007/FX-008 broken links return 404', async () => {
  assert.equal((await get('/products/tablets')).status, 404);
  assert.equal((await get('/privacy-policy')).status, 404);
});

test('FX-009 pricing redirects to about', async () => {
  const r = await get('/pricing');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/about');
});

test('FX-010 careers is a redirect loop', async () => {
  assert.equal((await get('/careers')).headers.get('location'), '/jobs');
  assert.equal((await get('/jobs')).headers.get('location'), '/careers');
});

test('FX-012 team returns 500', async () => {
  assert.equal((await get('/team')).status, 500);
});

test('FX-003 broken image is missing; valid images exist', async () => {
  assert.equal((await get('/static/headphones.png')).status, 404);
  assert.equal((await get('/static/laptop.svg')).status, 200);
});

test('sitemap exposes sitemap-only page', async () => {
  const xml = await (await get('/sitemap.xml')).text();
  for (const p of manifest.discovery.sitemapOnly) assert.ok(xml.includes(p));
  assert.equal((await get('/shipping')).status, 200);
});

test('authenticated pages redirect anonymous users to login', async () => {
  for (const p of manifest.discovery.authenticated) {
    const r = await get(p);
    assert.equal(r.status, 302, p);
    assert.match(r.headers.get('location'), /^\/login/);
  }
});

test('login works and grants access; bad password is rejected', async () => {
  const cookie = await login('customer@fixture.test', 'Customer#Pass123');
  assert.ok(cookie?.startsWith('sid='));
  assert.equal((await get('/dashboard', { headers: { cookie } })).status, 200);
  const bad = await get('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'customer@fixture.test', password: 'wrong' }),
  });
  assert.equal(bad.headers.get('location'), '/login?error=1');
});

test('FX-019 authenticated invoices link is 404', async () => {
  const cookie = await login('customer@fixture.test', 'Customer#Pass123');
  assert.equal((await get('/invoices', { headers: { cookie } })).status, 404);
});

test('role-based pages: admin allowed, customer forbidden', async () => {
  const customer = await login('customer@fixture.test', 'Customer#Pass123');
  const admin = await login('admin@fixture.test', 'Admin#Pass123');
  for (const p of manifest.discovery.roleBased.admin) {
    assert.equal((await get(p, { headers: { cookie: customer } })).status, 403, `customer ${p}`);
    assert.equal((await get(p, { headers: { cookie: admin } })).status, 200, `admin ${p}`);
  }
});

test('FX-013/FX-014 contact form accepts invalid email & phone; control: name required', async () => {
  const post = (body) =>
    get('/contact', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const accepted = await post({ name: 'QA', email: 'not-an-email', phone: 'abcdefg', message: 'hi' });
  assert.equal(accepted.status, 303);
  assert.equal(accepted.headers.get('location'), '/contact?sent=1');
  const rejected = await post({ name: '', email: 'qa@x.io', phone: '123', message: 'hi' });
  assert.equal(rejected.status, 400);
});

test('FX-016/FX-018 signup accepts weak password and mismatched confirmation', async () => {
  const r = await get('/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Weak', email: 'weak@fixture.test', password: '123', confirm: '999' }),
  });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /account was created/);
});

test('destructive delete-account action is real and resettable', async () => {
  const cookie = await login('customer@fixture.test', 'Customer#Pass123');
  await get('/account/delete', { method: 'POST', headers: { cookie } });
  assert.deepEqual((await (await get('/__state')).json()).deletedAccounts, ['customer@fixture.test']);
  await get('/__reset', { method: 'POST' });
  assert.ok(await login('customer@fixture.test', 'Customer#Pass123'));
});
