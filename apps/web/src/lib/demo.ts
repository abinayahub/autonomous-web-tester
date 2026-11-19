/**
 * DEMONSTRATION DATA — used only when "Demo data" is switched on.
 * Fictional sites on the reserved .example domain; every record has demo: true,
 * issue keys start with "DEMO-", and every screenshot is a watermarked illustration.
 * None of this comes from a real test run.
 */
import { illustration, type IllustrationOptions } from './illustration';
import type { Activity, Issue, ModuleId, Project, Run, Screenshot, Severity, DeviceClass, ViewportId, IssueStatus } from './types';
import { ALL_MODULES } from './catalog';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export const DEMO_PROJECTS: Project[] = [
  { id: 'demo-northwind', name: 'Northwind Shop', url: 'https://shop.northwind.example', environment: 'STAGING', authType: 'FORM', credentials: [{ id: 'dc1', roleName: 'customer', username: 'qa.customer@northwind.example', secretProvided: true }, { id: 'dc2', roleName: 'admin', username: 'qa.admin@northwind.example', secretProvided: true }], authorizationConfirmedAt: ago(30 * DAY), createdAt: ago(30 * DAY), demo: true },
  { id: 'demo-contoso', name: 'Contoso Customer Portal', url: 'https://portal.contoso.example', environment: 'TEST', authType: 'FORM', credentials: [{ id: 'dc3', roleName: 'member', username: 'tester@contoso.example', secretProvided: true }], authorizationConfirmedAt: ago(21 * DAY), createdAt: ago(21 * DAY), demo: true },
  { id: 'demo-fabrikam', name: 'Fabrikam Docs', url: 'https://docs.fabrikam.example', environment: 'PRODUCTION', authType: 'NONE', credentials: [], authorizationConfirmedAt: ago(12 * DAY), createdAt: ago(12 * DAY), demo: true },
];

const run = (id: string, projectId: string, daysAgo: number, mins: number, pages: number, passed: number, failed: number, flaky: number, issues: number, status: Run['status'] = 'COMPLETED', modules: ModuleId[] = ALL_MODULES): Run => ({
  id, projectId, status, modules, pagesDiscovered: pages, testsPassed: passed, testsFailed: failed, testsFlaky: flaky, issuesFound: issues,
  startedAt: ago(daysAgo * DAY), finishedAt: ago(daysAgo * DAY - mins * 60_000), demo: true,
});

export const DEMO_RUNS: Run[] = [
  run('demo-run-1', 'demo-northwind', 13, 18, 34, 412, 31, 4, 9),
  run('demo-run-2', 'demo-contoso', 11, 12, 21, 248, 14, 2, 5),
  run('demo-run-3', 'demo-fabrikam', 10, 9, 58, 530, 6, 1, 2),
  run('demo-run-4', 'demo-northwind', 8, 17, 36, 431, 22, 3, 7),
  run('demo-run-5', 'demo-contoso', 6, 13, 22, 259, 11, 1, 4),
  run('demo-run-6', 'demo-fabrikam', 4, 4, 58, 188, 3, 0, 1, 'STOPPED', ['UI_LAYOUT', 'NAVIGATION', 'CONSOLE_NETWORK']),
  run('demo-run-7', 'demo-northwind', 2, 19, 38, 452, 15, 2, 6),
  run('demo-run-8', 'demo-contoso', 1, 12, 23, 266, 8, 3, 3),
  run('demo-run-9', 'demo-fabrikam', 0.2, 10, 61, 561, 4, 1, 3),
];

// ── Screenshots ──
const shots: Screenshot[] = [];
function shot(id: string, s: Omit<Screenshot, 'id' | 'src' | 'width' | 'height' | 'demo' | 'pageUrl'> & { ill: IllustrationOptions }): string {
  const { ill, ...rest } = s;
  const img = illustration(ill);
  const project = DEMO_PROJECTS.find((p) => p.id === s.projectId)!;
  shots.push({ id, ...rest, pageUrl: project.url + ill.path, src: img.src, width: img.width, height: img.height, demo: true });
  return id;
}

interface IssueSeed {
  n: number;
  projectId: string;
  runId: string;
  title: string;
  description: string;
  pageName: string;
  path: string;
  module: ModuleId;
  severity: Severity;
  status: IssueStatus;
  classification?: Issue['classification'];
  expected: string;
  actual: string;
  steps: string[];
  device?: DeviceClass;
  viewport?: ViewportId;
  element?: string;
  hoursAgo: number;
  ill: Omit<IllustrationOptions, 'site' | 'path'>;
  pair?: { before: Omit<IllustrationOptions, 'site' | 'path'>; after: Omit<IllustrationOptions, 'site' | 'path'> };
}

const siteName = (projectId: string) => DEMO_PROJECTS.find((p) => p.id === projectId)!.name.split(' ')[0]!;

const SEEDS: IssueSeed[] = [
  { n: 1042, projectId: 'demo-northwind', runId: 'demo-run-7', title: '"Add to cart" button does nothing', description: 'Clicking the primary call-to-action on the product page produces no navigation, network request or DOM change.', pageName: 'Product detail', path: '/products/headphones', module: 'BUTTON', severity: 'CRITICAL', status: 'OPEN', expected: 'Item is added to the cart and the cart badge count increases to 1.', actual: 'No network request was sent, no DOM mutation occurred and the cart count stayed at 0 after 3 attempts.', steps: ['Open /products/headphones', 'Click "Add to cart"', 'Observe the cart badge and network panel'], element: 'button.btn-primary[data-action="add"]', hoursAgo: 48,
    ill: { layout: 'product', highlight: { x: 704, y: 300, w: 196, h: 62, label: 'Dead button — no effect after click' } },
    pair: { before: { layout: 'product', state: 'before', defect: 'dead-button', highlight: { x: 704, y: 300, w: 196, h: 62, label: 'Before click' } }, after: { layout: 'product', state: 'after', defect: 'dead-button', highlight: { x: 704, y: 410, w: 260, h: 40, label: 'After click — nothing changed' } } } },
  { n: 1043, projectId: 'demo-northwind', runId: 'demo-run-7', title: 'Promo banner overlaps the hero call-to-action', description: 'The "Free shipping" banner is absolutely positioned on top of the "Shop now" button, blocking clicks on part of it.', pageName: 'Home', path: '/', module: 'UI_LAYOUT', severity: 'HIGH', status: 'OPEN', expected: 'Banner and button do not overlap; the full button area is clickable.', actual: 'Bounding boxes intersect by 1,980 px²; elementFromPoint at the button centre returns the banner.', steps: ['Open / at 1280 × 800', 'Locate the "Shop now" button', 'Hover the right half of the button'], element: '.promo-banner', hoursAgo: 47,
    ill: { layout: 'home', defect: 'overlap', highlight: { x: 90, y: 262, w: 540, h: 96, label: 'Overlap: promo banner covers "Shop now"' } } },
  { n: 1044, projectId: 'demo-northwind', runId: 'demo-run-7', title: 'Product image returns 404', description: 'The second featured product image fails to load on the home page.', pageName: 'Home', path: '/', module: 'UI_LAYOUT', severity: 'MEDIUM', status: 'ACKNOWLEDGED', expected: 'All product images load (HTTP 200) and render with non-zero natural size.', actual: 'GET /static/img/watch-v2.png returned 404; naturalWidth = 0.', steps: ['Open /', 'Scroll to "Featured"', 'Inspect the second product card image'], element: 'img[alt="Smart watch"]', hoursAgo: 47,
    ill: { layout: 'home', defect: 'broken-image', highlight: { x: 485, y: 420, w: 310, h: 130, label: 'Broken image (HTTP 404)' } } },
  { n: 1045, projectId: 'demo-northwind', runId: 'demo-run-7', title: 'Cart page overflows horizontally on mobile', description: 'At 375 px wide, the cart page is wider than the viewport, causing horizontal scrolling.', pageName: 'Cart', path: '/cart', module: 'RESPONSIVE', severity: 'HIGH', status: 'OPEN', expected: 'document.scrollWidth ≤ viewport width (375 px).', actual: 'document.scrollWidth = 471 px on Mobile 375; offending element: .promo-strip (width 460 px).', steps: ['Open /cart on a 375 × 812 viewport', 'Scroll horizontally'], device: 'MOBILE', viewport: 'mobile-375', element: '.promo-strip', hoursAgo: 46,
    ill: { layout: 'cart', mobile: true, defect: 'overflow', highlight: { x: 250, y: 405, w: 136, h: 90, label: 'Overflows by 96 px' } } },
  { n: 1046, projectId: 'demo-northwind', runId: 'demo-run-7', title: 'Sign-up accepts a weak password', description: 'The registration form accepted "abc123" without showing any password requirements.', pageName: 'Sign up', path: '/signup', module: 'PASSWORD', severity: 'HIGH', status: 'OPEN', expected: 'Weak password is rejected with a message describing the password rules.', actual: 'Form submitted successfully with password "••••••" (6 chars, no symbol); no rules were displayed.', steps: ['Open /signup', 'Fill valid name and email', 'Enter a 6-character password in both fields', 'Submit'], hoursAgo: 45,
    ill: { layout: 'form', state: 'after', highlight: { x: 410, y: 330, w: 460, h: 130, label: 'Weak password accepted' } },
    pair: { before: { layout: 'form', state: 'before', highlight: { x: 410, y: 330, w: 460, h: 130, label: 'Before submit — weak password entered' } }, after: { layout: 'form', state: 'after', highlight: { x: 410, y: 520, w: 460, h: 110, label: 'After submit — account created' } } } },
  { n: 1047, projectId: 'demo-northwind', runId: 'demo-run-7', title: 'Uncaught TypeError on product listing', description: 'A JavaScript exception is thrown while rendering recommendations.', pageName: 'Products', path: '/products', module: 'CONSOLE_NETWORK', severity: 'MEDIUM', status: 'OPEN', expected: 'No uncaught exceptions or failed requests during page load.', actual: '1 uncaught TypeError and 1 failed request (GET /api/recommendations → 500).', steps: ['Open /products', 'Open the browser console'], hoursAgo: 44,
    ill: { layout: 'home', defect: 'console', highlight: { x: 8, y: 648, w: 900, h: 70, label: 'Console errors captured' } } },
  { n: 1051, projectId: 'demo-contoso', runId: 'demo-run-8', title: 'Contact form accepts an invalid email address', description: 'The support form accepted "not-an-email" and showed a success message.', pageName: 'Contact support', path: '/support/contact', module: 'FORM', severity: 'MEDIUM', status: 'OPEN', expected: 'Validation error "Enter a valid email address" and the form is not submitted.', actual: 'Form submitted; success toast shown; POST /api/contact returned 200.', steps: ['Open /support/contact', 'Enter "not-an-email" in Email', 'Submit'], hoursAgo: 22,
    ill: { layout: 'form', defect: 'misaligned', highlight: { x: 410, y: 252, w: 460, h: 70, label: 'Invalid email accepted' } } },
  { n: 1052, projectId: 'demo-contoso', runId: 'demo-run-8', title: 'Login redirects to the wrong page', description: 'After a successful login the user is sent to /home-old (404) instead of the dashboard.', pageName: 'Sign in', path: '/login', module: 'NAVIGATION', severity: 'HIGH', status: 'OPEN', expected: 'Redirect to /dashboard after sign-in.', actual: 'Redirected 302 → /home-old, which returns 404.', steps: ['Open /login', 'Sign in as "member"', 'Observe the final URL'], hoursAgo: 21,
    ill: { layout: 'error', highlight: { x: 440, y: 200, w: 400, h: 170, label: 'Landed on 404 after login' } } },
  { n: 1053, projectId: 'demo-contoso', runId: 'demo-run-8', title: '"Download invoice" link is broken', description: 'The invoice link in Billing returns HTTP 500.', pageName: 'Billing', path: '/account/billing', module: 'BUTTON', severity: 'MEDIUM', status: 'FIXED', expected: 'Invoice PDF downloads (HTTP 200, application/pdf).', actual: 'GET /invoices/2026-10.pdf returned 500.', steps: ['Sign in as "member"', 'Open /account/billing', 'Click "Download invoice"'], hoursAgo: 20,
    ill: { layout: 'error', defect: 'console', highlight: { x: 440, y: 200, w: 400, h: 170, label: 'HTTP 500 after clicking the link' } } },
  { n: 1054, projectId: 'demo-contoso', runId: 'demo-run-8', title: 'Save button misaligned with Cancel on tablet', description: 'On tablet the Save button is offset 37 px from the Cancel button baseline.', pageName: 'Profile', path: '/account/profile', module: 'UI_LAYOUT', severity: 'LOW', status: 'OPEN', classification: 'NEEDS_REVIEW', expected: 'Action buttons share the same top edge and spacing.', actual: 'Top edges differ by 37 px (AI vision observation; not deterministically confirmed).', steps: ['Open /account/profile at 768 × 1024', 'Compare the action buttons'], device: 'TABLET', viewport: 'tablet-768', hoursAgo: 19,
    ill: { layout: 'product', defect: 'misaligned', highlight: { x: 700, y: 290, w: 260, h: 140, label: 'Possible misalignment (needs review)' } } },
  { n: 1055, projectId: 'demo-contoso', runId: 'demo-run-8', title: 'Search results intermittently empty', description: 'Search for "invoice" returned no results once, then results on retry.', pageName: 'Search', path: '/search?q=invoice', module: 'FUNCTIONAL', severity: 'LOW', status: 'OPEN', classification: 'FLAKY', expected: 'Search returns matching results consistently.', actual: 'Attempt 1: 0 results; attempt 2: 6 results. Reported as flaky, not as a confirmed bug.', steps: ['Open /search', 'Search for "invoice"', 'Repeat'], hoursAgo: 18,
    ill: { layout: 'docs', highlight: { x: 320, y: 120, w: 640, h: 100, label: 'Flaky: empty on first attempt' } } },
  { n: 1061, projectId: 'demo-fabrikam', runId: 'demo-run-9', title: 'Sidebar link points to a missing anchor', description: 'The "Configuration" sidebar link targets #configuration, which does not exist on the page.', pageName: 'Getting started', path: '/docs/getting-started', module: 'NAVIGATION', severity: 'LOW', status: 'OPEN', expected: 'Anchor #configuration exists and the page scrolls to it.', actual: 'No element with id="configuration"; scroll position unchanged.', steps: ['Open /docs/getting-started', 'Click "Configuration" in the sidebar'], hoursAgo: 4,
    ill: { layout: 'docs', highlight: { x: 70, y: 255, w: 210, h: 40, label: 'Missing anchor #configuration' } } },
  { n: 1062, projectId: 'demo-fabrikam', runId: 'demo-run-9', title: 'Code block overflows on mobile', description: 'Long code lines push the page wider than the mobile viewport.', pageName: 'API reference', path: '/docs/api', module: 'RESPONSIVE', severity: 'MEDIUM', status: 'OPEN', expected: 'Code blocks scroll internally; page width ≤ 375 px.', actual: 'document.scrollWidth = 612 px on Mobile 375.', steps: ['Open /docs/api on a 375 × 812 viewport', 'Scroll to the first code sample'], device: 'MOBILE', viewport: 'mobile-375', hoursAgo: 4,
    ill: { layout: 'docs', mobile: true, defect: 'overflow', highlight: { x: 20, y: 310, w: 360, h: 160, label: 'Overflows viewport' } } },
  { n: 1063, projectId: 'demo-fabrikam', runId: 'demo-run-9', title: 'Missing favicon request fails', description: 'The page requests /favicon.ico, which returns 404 on every page.', pageName: 'All pages', path: '/', module: 'CONSOLE_NETWORK', severity: 'INFO', status: 'WONT_FIX', expected: 'No failed requests.', actual: 'GET /favicon.ico → 404 on 61 pages.', steps: ['Open any page', 'Inspect the network panel'], hoursAgo: 4,
    ill: { layout: 'docs', defect: 'console', highlight: { x: 8, y: 648, w: 640, h: 70, label: '404 /favicon.ico' } } },
];

export const DEMO_ISSUES: Issue[] = SEEDS.map((s) => {
  const site = siteName(s.projectId);
  const ids: string[] = [];
  const device = s.device ?? 'DESKTOP';
  const base = { projectId: s.projectId, runId: s.runId, issueId: `demo-issue-${s.n}`, pageName: s.pageName, device, capturedAt: ago(s.hoursAgo * HOUR) };
  ids.push(shot(`demo-shot-${s.n}`, { ...base, kind: 'ISSUE', label: s.title, ill: { ...s.ill, site, path: s.path } }));
  if (s.pair) {
    ids.push(shot(`demo-shot-${s.n}-before`, { ...base, kind: 'BEFORE', pairId: `pair-${s.n}`, label: 'Before action', ill: { ...s.pair.before, site, path: s.path } }));
    ids.push(shot(`demo-shot-${s.n}-after`, { ...base, kind: 'AFTER', pairId: `pair-${s.n}`, label: 'After action', ill: { ...s.pair.after, site, path: s.path } }));
  }
  return {
    id: `demo-issue-${s.n}`,
    key: `DEMO-${s.n}`,
    projectId: s.projectId,
    runId: s.runId,
    title: s.title,
    description: s.description,
    pageName: s.pageName,
    pageUrl: DEMO_PROJECTS.find((p) => p.id === s.projectId)!.url + s.path,
    module: s.module,
    severity: s.severity,
    status: s.status,
    classification: s.classification ?? 'CONFIRMED',
    expected: s.expected,
    actual: s.actual,
    steps: s.steps,
    device,
    viewport: s.viewport ?? 'desktop-1280',
    browser: 'Chromium',
    element: s.element,
    screenshotIds: ids,
    detectedAt: ago(s.hoursAgo * HOUR),
    demo: true,
  };
});

// Full-page captures (no issue) for the gallery.
for (const [i, p] of [
  ['demo-northwind', '/', 'Home', 'home'],
  ['demo-northwind', '/products/headphones', 'Product detail', 'product'],
  ['demo-contoso', '/login', 'Sign in', 'login'],
  ['demo-fabrikam', '/docs/getting-started', 'Getting started', 'docs'],
].entries()) {
  const [projectId, path, pageName, layout] = p as [string, string, string, IllustrationOptions['layout']];
  shot(`demo-page-${i}`, { projectId, runId: projectId === 'demo-northwind' ? 'demo-run-7' : projectId === 'demo-contoso' ? 'demo-run-8' : 'demo-run-9', kind: 'PAGE', label: `${pageName} — full page`, pageName, device: 'DESKTOP', capturedAt: ago((5 + i) * HOUR), ill: { site: siteName(projectId), path, layout } });
}

export const DEMO_SCREENSHOTS: Screenshot[] = shots;

export const DEMO_ACTIVITY: Activity[] = [
  { id: 'da1', at: ago(0.2 * DAY - 10 * 60_000), kind: 'RUN_COMPLETED', message: 'Fabrikam Docs — run completed: 561 passed, 4 failed', projectId: 'demo-fabrikam', link: '/reports?project=demo-fabrikam', demo: true },
  { id: 'da2', at: ago(4 * HOUR), kind: 'ISSUE_FOUND', message: 'DEMO-1062 · Code block overflows on mobile', projectId: 'demo-fabrikam', link: '/issues/demo-issue-1062', demo: true },
  { id: 'da3', at: ago(19 * HOUR), kind: 'ISSUE_FOUND', message: 'DEMO-1052 · Login redirects to the wrong page', projectId: 'demo-contoso', link: '/issues/demo-issue-1052', demo: true },
  { id: 'da4', at: ago(1 * DAY - 12 * 60_000), kind: 'RUN_COMPLETED', message: 'Contoso Customer Portal — run completed: 266 passed, 8 failed', projectId: 'demo-contoso', link: '/reports?project=demo-contoso', demo: true },
  { id: 'da5', at: ago(2 * DAY - 19 * 60_000), kind: 'RUN_COMPLETED', message: 'Northwind Shop — run completed: 452 passed, 15 failed', projectId: 'demo-northwind', link: '/reports?project=demo-northwind', demo: true },
  { id: 'da6', at: ago(2 * DAY), kind: 'ISSUE_FOUND', message: 'DEMO-1042 · "Add to cart" button does nothing', projectId: 'demo-northwind', link: '/issues/demo-issue-1042', demo: true },
  { id: 'da7', at: ago(4 * DAY), kind: 'RUN_STOPPED', message: 'Fabrikam Docs — run stopped by user', projectId: 'demo-fabrikam', demo: true },
  { id: 'da8', at: ago(12 * DAY), kind: 'PROJECT_CREATED', message: 'Fabrikam Docs project created', projectId: 'demo-fabrikam', link: '/projects/demo-fabrikam', demo: true },
];

/** Pages the demo live-testing simulation "discovers", per demo project. */
export const DEMO_SITE_PAGES: Record<string, string[]> = {
  'demo-northwind': ['/', '/products', '/products/headphones', '/products/watch', '/deals', '/cart', '/checkout', '/login', '/signup', '/account', '/account/orders', '/about', '/contact', '/faq'],
  'demo-contoso': ['/', '/login', '/dashboard', '/account/profile', '/account/billing', '/support', '/support/contact', '/search', '/notifications'],
  'demo-fabrikam': ['/', '/docs', '/docs/getting-started', '/docs/api', '/docs/guides', '/docs/faq', '/changelog', '/blog'],
};
