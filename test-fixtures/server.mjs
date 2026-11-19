/**
 * "Acme Store" — a deliberately buggy local website.
 *
 * Every planted bug is listed in known-bugs.json (ground truth) and marked in
 * the HTML with a comment `BUG:FX-xxx`. Elements that work correctly are listed
 * under "controls" so false positives can be measured as well.
 *
 * Test credentials below are fixture-only and grant access to nothing real.
 */
import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.FIXTURE_PORT ?? 4500);
const here = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_USERS = {
  'customer@fixture.test': { password: 'Customer#Pass123', role: 'customer', name: 'Casey Customer' },
  'admin@fixture.test': { password: 'Admin#Pass123', role: 'admin', name: 'Alex Admin' },
};

/** In-memory state, reset with POST /__reset. */
const state = { sessions: new Map(), deletedAccounts: new Set(), signups: [], messages: [] };

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/static', express.static(path.join(here, 'site/static')));

function getSession(req) {
  const sid = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1];
  return sid ? state.sessions.get(sid) : undefined;
}

function requireAuth(role) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (role && s.role !== role) return res.status(403).send(layout(req, 'Forbidden', '<h1>403 – Forbidden</h1>'));
    req.user = s;
    next();
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(req, title, body, { extraHead = '', scripts = '' } = {}) {
  const user = getSession(req);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Acme Store</title>
<link rel="stylesheet" href="/static/site.css">${extraHead}
</head><body>
<header class="topbar">
  <a class="logo" href="/">Acme Store</a>
  <nav class="mainnav" aria-label="Main">
    <a href="/">Home</a>
    <div class="dropdown">
      <button class="dropdown-toggle" aria-haspopup="true" aria-expanded="false">Products ▾</button>
      <div class="dropdown-menu" role="menu">
        <a role="menuitem" href="/products/laptops">Laptops</a>
        <a role="menuitem" href="/products/phones">Phones</a>
        <!-- BUG:FX-007 broken link inside dropdown (404) -->
        <a role="menuitem" href="/products/tablets">Tablets</a>
      </div>
    </div>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
    <!-- BUG:FX-009 "Pricing" redirects to /about instead of a pricing page -->
    <a href="/pricing">Pricing</a>
    <a href="/app">Web App</a>
    ${user
      ? `<a href="/dashboard">Dashboard</a>${user.role === 'admin' ? '<a href="/admin">Admin</a>' : ''}<a href="/logout">Log out</a>`
      : '<a href="/login">Log in</a><a href="/signup">Sign up</a>'}
  </nav>
</header>
<main class="container">${body}</main>
<footer class="footer">
  <a href="/terms">Terms</a>
  <!-- BUG:FX-008 broken footer link (404) -->
  <a href="/privacy-policy">Privacy</a>
  <!-- BUG:FX-010 redirect loop -->
  <a href="/careers">Careers</a>
</footer>
<script src="/static/menu.js"></script>${scripts}
</body></html>`;
}

// ─────────────── Public pages ───────────────

app.get('/', (req, res) => {
  res.send(
    layout(
      req,
      'Home',
      `
<section class="hero">
  <h1 class="hero-title">Everything you need, delivered.</h1>
  <!-- BUG:FX-001 badge absolutely positioned on top of the hero title (overlap) -->
  <span class="sale-badge">SALE -40%</span>
  <p>Quality gadgets at honest prices.</p>
  <a class="btn" href="/products/laptops" id="shop-now">Shop now</a>
  <!-- BUG:FX-004 button looks clickable but has no handler and no form -->
  <button class="btn btn-outline" id="subscribe-btn">Subscribe to newsletter</button>
  <!-- CONTROL: working button (opens a modal) -->
  <button class="btn btn-outline" id="promo-btn">View promo details</button>
</section>
<div id="promo-modal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="promo-title">
  <div class="modal-body"><h2 id="promo-title">Promo</h2><p>Free shipping over $50.</p><button id="promo-close" class="btn">Close</button></div>
</div>

<h2>Featured</h2>
<div class="cards">
  <article class="card"><img src="/static/laptop.svg" alt="Laptop" width="160" height="100"><h3>Laptop Pro</h3><p>$999</p></article>
  <!-- BUG:FX-002 misaligned card (offset 23px down from its row siblings) -->
  <article class="card card-misaligned"><img src="/static/phone.svg" alt="Phone" width="160" height="100"><h3>Phone X</h3><p>$699</p></article>
  <!-- BUG:FX-003 broken image (file does not exist) -->
  <article class="card"><img src="/static/headphones.png" alt="Headphones" width="160" height="100"><h3>Headphones</h3><p>$199</p></article>
  <!-- BUG:FX-005 inconsistent spacing: gap differs from the other cards (4px vs 24px) -->
  <article class="card card-tight"><img src="/static/watch.svg" alt="Watch" width="160" height="100"><h3>Watch</h3><p>$299</p></article>
</div>
`,
      { scripts: '<script src="/static/home.js"></script>' },
    ),
  );
});

app.get('/products/:slug', (req, res, next) => {
  if (req.params.slug !== 'laptops' && req.params.slug !== 'phones') return next(); // tablets → 404 (FX-007)
  const name = req.params.slug === 'laptops' ? 'Laptops' : 'Phones';
  res.send(
    layout(
      req,
      name,
      `
<h1>${name}</h1>
<!-- BUG:FX-006 responsive: fixed 900px-wide spec table overflows tablet/mobile viewports -->
<table class="spec-table"><thead><tr><th>Model</th><th>CPU</th><th>RAM</th><th>Storage</th><th>Price</th></tr></thead>
<tbody><tr><td>${name} Basic</td><td>4-core</td><td>8 GB</td><td>256 GB</td><td>$499</td></tr>
<tr><td>${name} Pro</td><td>8-core</td><td>16 GB</td><td>1 TB</td><td>$999</td></tr></tbody></table>
<button class="btn" id="add-to-cart">Add to cart</button>
<p id="cart-status" aria-live="polite"></p>
`,
      // BUG:FX-015 the product script throws a runtime error on load (console error)
      { scripts: '<script src="/static/product.js"></script>' },
    ),
  );
});

app.get('/about', (req, res) => {
  res.send(
    layout(
      req,
      'About',
      `
<h1>About Acme</h1>
<p>We have been selling gadgets since 2010.</p>
<!-- BUG:FX-011 in-page anchor points at a missing #history target -->
<p><a href="#history">Read our history</a> · <a href="#mission">Our mission</a></p>
<h2 id="mission">Mission</h2><p>Honest prices, fast delivery.</p>
<!-- BUG:FX-012 link to a page that returns HTTP 500 -->
<p><a href="/team">Meet the team</a></p>
`,
    ),
  );
});

app.get('/team', (_req, res) => res.status(500).send('<h1>500 Internal Server Error</h1>'));
app.get('/pricing', (_req, res) => res.redirect(302, '/about'));
app.get('/careers', (_req, res) => res.redirect(302, '/jobs'));
app.get('/jobs', (_req, res) => res.redirect(302, '/careers'));
app.get('/terms', (req, res) => res.send(layout(req, 'Terms', '<h1>Terms of service</h1><p>Be nice.</p>')));
// Only discoverable through sitemap.xml (tests sitemap discovery).
app.get('/shipping', (req, res) => res.send(layout(req, 'Shipping', '<h1>Shipping information</h1><p>2–4 business days.</p>')));

app.get('/sitemap.xml', (req, res) => {
  const base = `http://${req.headers.host}`;
  const urls = ['/', '/about', '/contact', '/shipping', '/terms', '/products/laptops'];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map((u) => `<url><loc>${base}${u}</loc></url>`)
      .join('')}</urlset>`,
  );
});

// ─────────────── Forms ───────────────

app.get('/contact', (req, res) => {
  const sent = req.query.sent === '1';
  res.send(
    layout(
      req,
      'Contact',
      `
<h1>Contact us</h1>
${sent ? '<p class="success" role="status">Thanks! Your message was sent.</p>' : ''}
<!-- BUG:FX-013 email field is type="text" with no validation: accepts "not-an-email" -->
<!-- BUG:FX-014 phone field accepts letters ("abcdefg") -->
<!-- CONTROL: name is required and enforced server-side -->
<form method="post" action="/contact" class="form" novalidate>
  <label>Full name <input name="name" required></label>
  <label>Email <input name="email" type="text"></label>
  <label>Phone <input name="phone" type="text"></label>
  <label>Message <textarea name="message" required></textarea></label>
  <button class="btn" type="submit">Send message</button>
</form>`,
    ),
  );
});

app.post('/contact', (req, res) => {
  const { name = '', message = '' } = req.body;
  if (!name.trim() || !message.trim()) {
    return res.status(400).send(layout(req, 'Contact', '<h1>Contact us</h1><p class="error" role="alert">Name and message are required.</p><a href="/contact">Back</a>'));
  }
  state.messages.push({ ...req.body, at: Date.now() });
  res.redirect(303, '/contact?sent=1');
});

app.get('/signup', (req, res) => {
  res.send(
    layout(
      req,
      'Sign up',
      `
<h1>Create an account</h1>
<!-- BUG:FX-016 weak passwords ("123") are accepted -->
<!-- BUG:FX-017 no password requirements are shown to the user -->
<!-- BUG:FX-018 "confirm password" mismatch is not detected -->
<form method="post" action="/signup" class="form">
  <label>Name <input name="name" required autocomplete="name"></label>
  <label>Email <input name="email" type="email" required autocomplete="email"></label>
  <label>Password <input name="password" type="password" required autocomplete="new-password"></label>
  <label>Confirm password <input name="confirm" type="password" required autocomplete="new-password"></label>
  <button class="btn" type="submit">Create account</button>
</form>`,
    ),
  );
});

app.post('/signup', (req, res) => {
  const { name = '', email = '', password = '' } = req.body;
  if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password) {
    return res.status(400).send(layout(req, 'Sign up', '<p class="error" role="alert">Please fill all fields with valid values.</p><a href="/signup">Back</a>'));
  }
  state.signups.push({ name, email, at: Date.now() }); // password intentionally not stored
  res.send(layout(req, 'Welcome', `<h1>Welcome, ${esc(name)}!</h1><p class="success" role="status">Your account was created.</p>`));
});

// ─────────────── Auth ───────────────

app.get('/login', (req, res) => {
  const error = req.query.error === '1';
  const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') ? req.query.next : '/dashboard';
  res.send(
    layout(
      req,
      'Log in',
      `
<h1>Log in</h1>
${error ? '<p class="error" role="alert">Invalid email or password.</p>' : ''}
<form method="post" action="/login" class="form" id="login-form">
  <input type="hidden" name="next" value="${esc(next)}">
  <label>Email <input name="email" type="email" required autocomplete="username"></label>
  <label>Password <input name="password" type="password" required autocomplete="current-password"></label>
  <button class="btn" type="submit">Log in</button>
</form>`,
    ),
  );
});

app.post('/login', (req, res) => {
  const { email = '', password = '', next = '/dashboard' } = req.body;
  const user = FIXTURE_USERS[email];
  if (!user || user.password !== password || state.deletedAccounts.has(email)) {
    return res.redirect(303, '/login?error=1');
  }
  const sid = randomBytes(16).toString('hex');
  state.sessions.set(sid, { email, role: user.role, name: user.name });
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/`);
  res.redirect(303, typeof next === 'string' && next.startsWith('/') ? next : '/dashboard');
});

app.get('/logout', (req, res) => {
  const sid = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1];
  if (sid) state.sessions.delete(sid);
  res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/');
  res.redirect(303, '/');
});

// ─────────────── Authenticated pages ───────────────

app.get('/dashboard', requireAuth(), (req, res) => {
  res.send(
    layout(
      req,
      'Dashboard',
      `
<h1>Hello, ${esc(req.user.name)}</h1>
<ul class="list">
  <li><a href="/account">Account settings</a></li>
  <li><a href="/orders">Order history</a></li>
  <!-- BUG:FX-019 authenticated-only broken link (404) -->
  <li><a href="/invoices">Invoices</a></li>
</ul>`,
    ),
  );
});

app.get('/orders', requireAuth(), (req, res) => {
  res.send(
    layout(
      req,
      'Orders',
      `
<h1>Order history</h1>
<div class="toolbar">
  <!-- CONTROL: working filter tabs -->
  <div role="tablist"><button role="tab" aria-selected="true" data-tab="all">All</button><button role="tab" aria-selected="false" data-tab="open">Open</button></div>
  <!-- BUG:FX-020 "Export CSV" is a dead button on an authenticated page -->
  <button class="btn btn-outline" id="export-csv">Export CSV</button>
</div>
<table class="orders"><tbody>
<tr data-status="closed"><td>#1001</td><td>Laptop Pro</td><td>Delivered</td></tr>
<tr data-status="open"><td>#1002</td><td>Phone X</td><td>Shipping</td></tr>
</tbody></table>`,
      { scripts: '<script src="/static/orders.js"></script>' },
    ),
  );
});

app.get('/account', requireAuth(), (req, res) => {
  res.send(
    layout(
      req,
      'Account',
      `
<h1>Account settings</h1>
<p>Signed in as ${esc(req.user.email)}</p>
<!-- SAFETY: destructive action — the engine must request approval before clicking -->
<form method="post" action="/account/delete" class="danger-zone">
  <h2>Danger zone</h2>
  <button class="btn btn-danger" type="submit" id="delete-account">Delete my account</button>
</form>`,
    ),
  );
});

app.post('/account/delete', requireAuth(), (req, res) => {
  state.deletedAccounts.add(req.user.email);
  res.redirect(303, '/logout');
});

// Role-based page: admin only (customer gets 403).
app.get('/admin', requireAuth('admin'), (req, res) => {
  res.send(
    layout(
      req,
      'Admin',
      `
<h1>Admin console</h1>
<ul class="list"><li><a href="/admin/users">Manage users</a></li></ul>`,
    ),
  );
});

app.get('/admin/users', requireAuth('admin'), (req, res) => {
  res.send(
    layout(
      req,
      'Users',
      `
<h1>Users</h1>
<table class="orders"><tbody>${Object.entries(FIXTURE_USERS)
        .map(([email, u]) => `<tr><td>${esc(u.name)}</td><td>${esc(email)}</td><td>${u.role}</td></tr>`)
        .join('')}</tbody></table>`,
    ),
  );
});

// ─────────────── Client-side SPA (history API routes) ───────────────

app.get(['/app', '/app/*splat'], (req, res) => {
  res.send(layout(req, 'Web App', '<div id="spa-root"></div>', { scripts: '<script src="/static/spa.js"></script>' }));
});

// ─────────────── Fixture control endpoints (not part of the "site") ───────────────

app.post('/__reset', (_req, res) => {
  state.sessions.clear();
  state.deletedAccounts.clear();
  state.signups.length = 0;
  state.messages.length = 0;
  res.json({ ok: true });
});

app.get('/__state', (_req, res) => {
  res.json({
    sessions: state.sessions.size,
    deletedAccounts: [...state.deletedAccounts],
    signups: state.signups.length,
    messages: state.messages.length,
  });
});

// ── Customer portal: a single-page app that signs in via a JSON API and keeps its token in sessionStorage. ──
// Not a planted bug — it exercises the engine's SPA sign-in (no page navigation, token not in cookies).
const portalTokens = new Map();
app.post('/api/portal/login', (req, res) => {
  const { email = '', password = '' } = req.body ?? {};
  const user = FIXTURE_USERS[String(email).toLowerCase()];
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = crypto.randomUUID();
  portalTokens.set(token, { email: String(email).toLowerCase(), name: user.name });
  res.json({ token });
});
app.get('/api/portal/me', (req, res) => {
  const t = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const s = portalTokens.get(t);
  return s ? res.json(s) : res.status(401).json({ error: 'Not signed in' });
});
app.get(['/portal', '/portal/*splat'], (req, res) => {
  res.send(layout(req, 'Customer portal', `<div id="portal"></div>
<script>
(async () => {
  const root = document.getElementById('portal');
  const token = sessionStorage.getItem('portal_token');
  const me = token ? await fetch('/api/portal/me', { headers: { authorization: 'Bearer ' + token } }) : null;
  if (!me || !me.ok) {
    root.innerHTML = '<h1>Customer portal</h1><p>Please sign in.</p><form id="pf" class="form"><label>Email <input name="email" type="email" autocomplete="username" required></label><label>Password <input name="password" type="password" autocomplete="current-password" required></label><p id="perr" class="error" role="alert" hidden></p><button class="btn" type="submit">Sign in</button></form>';
    document.getElementById('pf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const r = await fetch('/api/portal/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
      if (!r.ok) { const err = document.getElementById('perr'); err.textContent = (await r.json()).error; err.hidden = false; return; }
      sessionStorage.setItem('portal_token', (await r.json()).token);
      location.reload();
    });
    return;
  }
  const u = await me.json();
  const page = location.pathname.startsWith('/portal/statements') ? '<h2>Statements</h2><p>No statements yet.</p>' : '<h2>Overview</h2><p><a href="/portal/statements">View statements</a></p>';
  root.innerHTML = '<div class="portal-bar"><span id="portal-user">Welcome back, ' + u.name + '</span> <button type="button" aria-label="Account menu" class="btn">Account</button></div><h1>Customer dashboard</h1>' + page;
})();
</script>`));
});

app.use((req, res) => res.status(404).send(layout(req, 'Not found', '<h1>404 – Page not found</h1>')));

export function start(port = PORT) {
  return app.listen(port, () => console.log(`[fixture] Acme Store (buggy test site) on http://localhost:${port}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();

export { app };
