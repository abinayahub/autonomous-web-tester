/**
 * PDF report built from the database (so it always matches what the app shows) and rendered by headless Chromium.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PrismaClient, Severity } from '@awt/db';
import { launchChromium } from './launch.js';

const SEV_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const SEV_COLOR: Record<Severity, string> = { CRITICAL: '#b42318', HIGH: '#c96f4a', MEDIUM: '#b7791f', LOW: '#4a6a5d', INFO: '#727568' };
const MODULE_LABEL: Record<string, string> = {
  NAVIGATION: 'Navigation & links', BUTTON: 'Buttons', FORM: 'Forms & inputs', PASSWORD: 'Password rules', RESPONSIVE: 'Responsive',
  UI_LAYOUT: 'UI layout', IMAGE: 'Images', CONSOLE_NETWORK: 'Console & network', ACCESSIBILITY: 'Accessibility', FUNCTIONAL: 'Metadata & functional',
};
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (d?: Date | null) => (d ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export interface ReportResult {
  reportId: string;
  storagePath: string;
  sizeBytes: number;
  pages: number;
}

export async function generateReport(db: PrismaClient, runId: string, storageRoot: string, notes: string[] = [], opts: { completed?: boolean } = {}): Promise<ReportResult> {
  const run = await db.testRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      project: true,
      pages: { orderBy: [{ depth: 'asc' }, { discoveredAt: 'asc' }] },
      issues: { include: { artifacts: { orderBy: { createdAt: 'asc' } }, element: true } },
      events: { where: { type: { in: ['run.limit', 'crawl.limit', 'auth.login', 'auth.failed', 'policy'] } }, orderBy: { id: 'asc' } },
    },
  });
  // One summary per test login (written by the run after sign-in and signed-in discovery).
  const authRows = (await db.runEvent.findMany({ where: { runId, type: 'auth.summary' }, orderBy: { id: 'asc' }, select: { data: true } }))
    .map((e) => e.data as { role: string; status: string; roleCheck?: string; roleConfirmed?: boolean; dashboardUrl?: string; evidence?: string; error?: string; pages: number; sessionLost?: string } | null)
    .filter((d): d is NonNullable<typeof d> => !!d?.role);
  const tcs = await db.testCase.groupBy({ by: ['pageId', 'module', 'status'], where: { runId }, _count: { _all: true } });
  const byModule = await db.testCase.groupBy({ by: ['module', 'status'], where: { runId }, _count: { _all: true } });
  const failedCases = await db.testCase.findMany({ where: { runId, status: 'FAILED' }, select: { pageId: true, module: true, observations: true } });
  const major = (o: unknown) => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(String((o as { severity?: string } | null)?.severity ?? 'MEDIUM'));
  const blocked = await db.testCase.findMany({ where: { runId, status: 'BLOCKED', module: { in: ['BUTTON', 'FORM'] } }, select: { name: true, observations: true }, take: 30 });

  const confirmed = run.issues.filter((i) => i.classification === 'CONFIRMED').sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.issueNumber - b.issueNumber);
  const review = run.issues.filter((i) => i.classification !== 'CONFIRMED').sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const sevCount = Object.fromEntries(SEV_ORDER.map((s) => [s, confirmed.filter((i) => i.severity === s).length])) as Record<Severity, number>;
  const totals = { tests: 0, passed: 0, failed: 0, other: 0 };
  for (const m of byModule) {
    totals.tests += m._count._all;
    if (m.status === 'PASSED') totals.passed += m._count._all;
    else if (m.status === 'FAILED') totals.failed += m._count._all;
    else totals.other += m._count._all;
  }
  const tested = run.pages.filter((p) => p.statusCode !== null);
  const status = run.status !== 'COMPLETED' && !opts.completed ? 'INCOMPLETE' : sevCount.CRITICAL ? 'CRITICAL ISSUES FOUND' : confirmed.length ? 'ISSUES FOUND' : 'PASSED';
  const statusColor = status === 'PASSED' ? '#557149' : status === 'INCOMPLETE' ? '#727568' : sevCount.CRITICAL || sevCount.HIGH ? '#b42318' : '#c96f4a';
  const durationMin = run.startedAt && run.finishedAt ? Math.max(1, Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 60000)) : undefined;

  // Images as data URIs (screenshots are stored on disk under the storage root).
  const img = new Map<string, string>();
  const loadImg = async (path: string) => {
    if (img.has(path)) return img.get(path)!;
    try {
      const b = await readFile(join(storageRoot, path));
      const uri = `data:image/png;base64,${b.toString('base64')}`;
      img.set(path, uri);
      return uri;
    } catch {
      return '';
    }
  };

  const cell = (pageId: string, modules: string[]) => {
    const rows = tcs.filter((t) => t.pageId === pageId && modules.includes(t.module));
    if (!rows.length) return '<td class="na">—</td>';
    const f = rows.filter((r) => r.status === 'FAILED').reduce((a, r) => a + r._count._all, 0);
    const p = rows.filter((r) => r.status === 'PASSED').reduce((a, r) => a + r._count._all, 0);
    const o = rows.filter((r) => r.status !== 'FAILED' && r.status !== 'PASSED').reduce((a, r) => a + r._count._all, 0);
    const serious = failedCases.filter((c) => c.pageId === pageId && modules.includes(c.module) && major(c.observations)).length;
    const label = !f ? `✓ ${p} passed` : serious ? `✕ ${f} failed` : `! ${f} minor`;
    return `<td class="${!f ? 'ok' : serious ? 'bad' : 'warn'}">${label}${o ? `<br><span class="muted">${o} other</span>` : ''}</td>`;
  };

  const issueCard = async (i: (typeof confirmed)[number]) => {
    const [desc, fix] = i.description.split('\n\nRecommended fix: ');
    const steps = Array.isArray(i.stepsToReproduce) ? (i.stepsToReproduce as string[]) : [];
    const shots = [];
    for (const a of i.artifacts.slice(0, 2)) {
      const uri = await loadImg(a.storagePath);
      const m = a.metadata as { label?: string; highlight?: unknown; viewportId?: string } | null;
      if (uri) shots.push(`<figure><img src="${uri}"><figcaption>${esc(m?.label ?? 'Screenshot')}${m?.viewportId ? ` · ${esc(m.viewportId)}` : ''} · ${m?.highlight ? 'affected element outlined in red' : 'page as shown to the user'}</figcaption></figure>`);
    }
    return `<article class="issue" id="${esc(i.issueKey)}">
      <header><span class="sev" style="background:${SEV_COLOR[i.severity]}">${esc(i.severity)}</span><span class="key">${esc(i.issueKey)}</span><h3>${esc(i.title)}</h3></header>
      <table class="meta"><tr><th>Category</th><td>${esc(i.category)} · ${esc(MODULE_LABEL[i.module] ?? i.module)}</td><th>Detected</th><td>${fmt(i.createdAt)}</td></tr>
      <tr><th>Affected URL</th><td colspan="3" class="url">${esc(i.pageUrl)}</td></tr>
      ${i.element ? `<tr><th>Element</th><td colspan="3"><code>${esc(i.element.selector)}</code>${i.element.text ? ` — ${esc(i.element.text)}` : ''}</td></tr>` : ''}
      <tr><th>Browser</th><td>Chromium${i.viewportId ? ` · ${esc(i.viewportId)}` : ''}${i.deviceClass ? ` (${esc(i.deviceClass.toLowerCase())})` : ''}</td><th>Confidence</th><td>${i.classification === 'CONFIRMED' ? 'Confirmed — reproduced with evidence' : i.classification === 'FLAKY' ? 'Intermittent' : 'Needs review'}</td></tr></table>
      <p class="desc">${esc(desc).replace(/\n/g, '<br>')}</p>
      <div class="ea"><div><h4>Expected</h4><p>${esc(i.expectedResult)}</p></div><div><h4>Actual</h4><p>${esc(i.actualResult)}</p></div></div>
      ${steps.length ? `<h4>Steps to reproduce</h4><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${shots.join('')}
      ${fix ? `<div class="fix"><h4>Recommended resolution</h4><p>${esc(fix)}</p></div>` : ''}
    </article>`;
  };

  const cards = [];
  for (const i of confirmed) cards.push(await issueCard(i));
  const gallery = [];
  for (const i of [...confirmed, ...review]) {
    for (const a of i.artifacts.slice(0, 2)) {
      if (gallery.length >= 60) break;
      const uri = await loadImg(a.storagePath);
      if (uri) gallery.push(`<figure class="g"><img src="${uri}"><figcaption><b>${esc(i.issueKey)}</b> ${esc(i.title)}</figcaption></figure>`);
    }
  }
  const majors = confirmed.filter((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  const fixes = [...new Map(confirmed.map((i) => [i.category, i.description.split('\n\nRecommended fix: ')[1] ?? ''])).entries()].filter(([, f]) => f).slice(0, 12);
  const moduleRows = [...new Set(byModule.map((m) => m.module))].map((m) => {
    const rows = byModule.filter((x) => x.module === m);
    const n = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + r._count._all, 0);
    return `<tr><td>${esc(MODULE_LABEL[m] ?? m)}</td><td>${rows.reduce((a, r) => a + r._count._all, 0)}</td><td class="ok">${n('PASSED')}</td><td class="${n('FAILED') ? 'bad' : ''}">${n('FAILED')}</td><td>${n('BLOCKED') + n('SKIPPED') + n('FLAKY') + n('ERROR')}</td><td>${confirmed.filter((i) => i.module === m).length}</td></tr>`;
  }).join('');
  const limits = [
    ...notes,
    ...run.events.map((e) => e.message),
    run.project.environment === 'PRODUCTION' ? 'Production site: data-changing requests (form submissions, POST/PUT/PATCH) were blocked; server-side validation could not be verified and is listed under "Needs review" where relevant.' : 'Test environment: form validation was verified with clearly fake test data (e.g. awt.test+…@example.com).',
    'Destructive, financial and sign-out actions are never performed.' + (blocked.length ? ` Not performed in this run: ${blocked.slice(0, 8).map((b) => b.name).join('; ')}${blocked.length > 8 ? '…' : ''}.` : ''),
  ];

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Testing report ${esc(run.project.name)}</title><style>
  @page { size: A4; margin: 22mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 'Segoe UI', Inter, system-ui, sans-serif; color: #222822; margin: 0; }
  h1, h2, h3, h4 { font-family: Manrope, 'Segoe UI', sans-serif; color: #20372d; margin: 0; }
  h2 { font-size: 17pt; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid #20372d; page-break-after: avoid; }
  h4 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .04em; color: #575c52; margin: 10px 0 4px; }
  section { page-break-before: always; }
  .cover { height: 245mm; display: flex; flex-direction: column; justify-content: space-between; background: #20372d; color: #f5f3ed; margin: -22mm -14mm 0; padding: 26mm 18mm; }
  .cover h1 { color: #f5f3ed; font-size: 30pt; line-height: 1.1; margin-top: 18mm; }
  .cover .brand { font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 9pt; color: #a5b49a; }
  .cover dl { display: grid; grid-template-columns: 42mm 1fr; gap: 6px 10px; font-size: 11pt; } .cover dt { color: #a5b49a; } .cover dd { margin: 0; word-break: break-all; }
  .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; font-weight: 700; color: #fff; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; } th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #e4e0d6; vertical-align: top; }
  th { color: #575c52; font-weight: 600; background: #f7f6f1; }
  .ok { color: #445b3b; } .bad { color: #b42318; font-weight: 600; } .warn { color: #a97d2b; font-weight: 600; } .na, .muted { color: #a19e92; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 16px; }
  .stat { border: 1px solid #e4e0d6; border-radius: 10px; padding: 10px; } .stat b { display: block; font-size: 20pt; color: #20372d; font-family: Manrope, sans-serif; } .stat span { color: #575c52; font-size: 8.5pt; }
  .sevs { display: flex; gap: 6px; margin-bottom: 14px; } .sevs div { flex: 1; border-radius: 8px; color: #fff; padding: 8px; text-align: center; } .sevs b { display: block; font-size: 16pt; }
  .toc a { color: #20372d; text-decoration: none; } .toc li { margin: 4px 0; }
  .issue { border: 1px solid #e4e0d6; border-left: 4px solid #20372d; border-radius: 8px; padding: 12px 14px; margin: 0 0 14px; page-break-inside: avoid; }
  .issue header { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; } .issue h3 { font-size: 12pt; flex-basis: 100%; }
  .sev { color: #fff; border-radius: 4px; padding: 1px 7px; font-size: 8pt; font-weight: 700; letter-spacing: .05em; } .key { font-family: Consolas, monospace; color: #575c52; font-size: 9pt; }
  .meta th { width: 24mm; background: none; } .url { word-break: break-all; font-family: Consolas, monospace; font-size: 8.5pt; }
  .ea { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .ea > div { background: #f7f6f1; border-radius: 6px; padding: 4px 10px; }
  figure { margin: 10px 0; } figure img { width: 100%; max-height: 120mm; object-fit: contain; object-position: top; border: 1px solid #d0cbbf; border-radius: 6px; } figcaption { font-size: 8pt; color: #727568; margin-top: 3px; }
  .fix { background: #eef2ec; border-radius: 6px; padding: 4px 10px; margin-top: 8px; page-break-inside: avoid; break-inside: avoid; }
  h4 { page-break-after: avoid; break-after: avoid; } .ea, ol { page-break-inside: avoid; break-inside: avoid; }
  .gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .g { page-break-inside: avoid; } .g img { max-height: 80mm; }
  code { font-family: Consolas, monospace; font-size: 8.5pt; background: #f7f6f1; padding: 0 3px; border-radius: 3px; word-break: break-all; }
  .review td:first-child { white-space: nowrap; }
  </style></head><body>
  <div class="cover">
    <div><div class="brand">Autonomous Web Tester</div><h1>Website Testing Report</h1><p style="font-size:13pt;color:#d0cbbf;margin-top:6mm">${esc(run.project.name)}</p></div>
    <dl><dt>Website</dt><dd>${esc(run.project.baseUrl)}</dd><dt>Project</dt><dd>${esc(run.project.name)}</dd><dt>Environment</dt><dd>${esc(run.project.environment)}</dd>
    <dt>Test run ID</dt><dd>${esc(run.id)}</dd><dt>Started</dt><dd>${fmt(run.startedAt)}</dd><dt>Finished</dt><dd>${fmt(run.finishedAt)}${durationMin ? ` (${durationMin} min)` : ''}</dd>
    <dt>Pages discovered</dt><dd>${run.pages.length}</dd><dt>Overall status</dt><dd><span class="badge" style="background:${statusColor}">${status}</span></dd></dl>
    <p style="font-size:8.5pt;color:#a5b49a">Generated ${fmt(new Date())} · Automated testing with Chromium. Only reproducible failures with evidence are reported as confirmed issues.</p>
  </div>
  <section><h2>Contents</h2><ol class="toc"><li><a href="#overview">Report overview</a></li><li><a href="#summary">Testing summary</a></li><li><a href="#pages">Page-by-page results</a></li><li><a href="#bugs">Detailed bug reports (${confirmed.length})</a></li>${review.length ? `<li><a href="#review">Items needing review (${review.length})</a></li>` : ''}<li><a href="#evidence">Screenshot evidence</a></li><li><a href="#final">Final summary</a></li></ol>
  <h2 id="overview" style="margin-top:12mm">1. Report overview</h2>
  <table><tr><th>Application</th><td>Autonomous Web Tester</td></tr><tr><th>Website URL</th><td class="url">${esc(run.project.baseUrl)}</td></tr><tr><th>Project</th><td>${esc(run.project.name)}</td></tr>
  <tr><th>Test run ID</th><td class="url">${esc(run.id)}</td></tr><tr><th>Date and time</th><td>${fmt(run.startedAt)} – ${fmt(run.finishedAt)}</td></tr><tr><th>Overall status</th><td><b style="color:${statusColor}">${status}</b></td></tr>
  <tr><th>Pages discovered</th><td>${run.pages.length} (${tested.length} loaded, ${run.pages.filter((p) => p.requiresAuth).length} behind sign-in)</td></tr></table>
  ${authRows.length ? `<h4 id="auth">Authentication</h4><table><tr><th>Role</th><th>Login status</th><th>Role check</th><th>Authenticated dashboard</th><th>Signed-in pages</th></tr>${authRows.map((a) => `<tr><td><b>${esc(a.role)}</b></td><td class="${a.status === 'SIGNED_IN' ? 'ok' : 'bad'}">${a.status === 'SIGNED_IN' ? 'Signed in' : 'Failed'}${a.evidence ? `<br><span class="muted">${esc(a.evidence)}</span>` : ''}</td><td class="${a.roleConfirmed ? 'ok' : a.status === 'SIGNED_IN' ? 'warn' : 'na'}">${a.roleCheck ? esc(a.roleCheck) : '—'}</td><td class="url">${a.dashboardUrl ? esc(a.dashboardUrl) : '—'}</td><td>${a.pages}</td></tr>${a.error || a.sessionLost ? `<tr><td></td><td colspan="4" class="bad">${esc(a.error ?? a.sessionLost ?? '')}</td></tr>` : ''}`).join('')}</table>` : ''}</section>
  <section id="summary"><h2>2. Testing summary</h2>
  <div class="stats"><div class="stat"><b>${tested.length}</b><span>Pages tested</span></div><div class="stat"><b>${totals.tests}</b><span>Checks performed</span></div><div class="stat"><b style="color:#445b3b">${totals.passed}</b><span>Checks passed</span></div><div class="stat"><b style="color:#b42318">${totals.failed}</b><span>Checks failed</span></div>
  <div class="stat"><b>${confirmed.length}</b><span>Issues detected (confirmed)</span></div><div class="stat"><b>${review.length}</b><span>Needs review / intermittent</span></div><div class="stat"><b>${totals.other}</b><span>Skipped / not performed</span></div><div class="stat"><b>${durationMin ?? '—'}</b><span>Minutes</span></div></div>
  <div class="sevs">${SEV_ORDER.map((s) => `<div style="background:${SEV_COLOR[s]}"><b>${sevCount[s]}</b>${s.charAt(0) + s.slice(1).toLowerCase()}</div>`).join('')}</div>
  <h4>Results by test area</h4><table><tr><th>Area</th><th>Checks</th><th>Passed</th><th>Failed</th><th>Other</th><th>Issues</th></tr>${moduleRows}</table></section>
  <section id="pages"><h2>3. Page-by-page testing</h2><table><tr><th>Page URL</th><th>HTTP</th><th>Navigation</th><th>Buttons</th><th>Inputs &amp; forms</th><th>Responsive</th><th>Technical</th><th>Status</th></tr>
  ${run.pages.map((p) => {
    const failed = failedCases.some((c) => c.pageId === p.id && major(c.observations));
    const minor = !failed && failedCases.some((c) => c.pageId === p.id);
    const any = tcs.some((t) => t.pageId === p.id);
    return `<tr><td class="url">${esc(p.url.replace(/^https?:\/\/[^/]+/, '') || '/')}${p.requiresAuth ? ` <span class="muted">(${/#as=(.+)$/.exec(p.normalizedUrl)?.[1] ? `signed in as ${esc(/#as=(.+)$/.exec(p.normalizedUrl)![1]!)}` : 'sign-in required'})</span>` : ''}</td><td class="${(p.statusCode ?? 0) >= 400 ? 'bad' : ''}">${p.statusCode ?? '—'}</td>${cell(p.id, ['NAVIGATION'])}${cell(p.id, ['BUTTON'])}${cell(p.id, ['FORM', 'PASSWORD'])}${cell(p.id, ['RESPONSIVE', 'UI_LAYOUT'])}${cell(p.id, ['CONSOLE_NETWORK', 'IMAGE', 'ACCESSIBILITY', 'FUNCTIONAL'])}<td class="${failed || (p.statusCode ?? 0) >= 400 ? 'bad' : minor ? 'warn' : any ? 'ok' : 'na'}">${failed || (p.statusCode ?? 0) >= 400 ? 'FAIL' : minor ? 'MINOR' : any ? 'PASS' : p.statusCode == null ? 'Not loaded' : p.requiresAuth ? 'Sign-in' : '—'}</td></tr>`;
  }).join('')}</table></section>
  <section id="bugs"><h2>4. Detailed bug reports</h2>${cards.join('') || '<p>No confirmed issues were found.</p>'}</section>
  ${review.length ? `<section id="review"><h2>Items needing review</h2><p class="muted">Observations that could not be confirmed automatically (intermittent, or not verifiable without performing a blocked action). They are not counted as bugs.</p>
  <table class="review"><tr><th>ID</th><th>Severity</th><th>Observation</th><th>Page</th></tr>${review.map((i) => `<tr><td>${esc(i.issueKey)}</td><td>${esc(i.severity)}${i.classification === 'FLAKY' ? ' · intermittent' : ''}</td><td><b>${esc(i.title)}</b><br>${esc(i.description.split('\n\nRecommended fix: ')[0]).slice(0, 400)}</td><td class="url">${esc(i.pageUrl)}</td></tr>`).join('')}</table></section>` : ''}
  <section id="evidence"><h2>5. Screenshot evidence</h2><div class="gallery">${gallery.join('') || '<p>No screenshots were needed.</p>'}</div></section>
  <section id="final"><h2>6. Final summary</h2>
  <table><tr><th>Coverage</th><td>${tested.length} of ${run.pages.length} discovered pages loaded and tested · ${totals.tests} checks across ${new Set(byModule.map((m) => m.module)).size} test areas</td></tr>
  <tr><th>Total issues</th><td>${confirmed.length} confirmed (${SEV_ORDER.filter((s) => sevCount[s]).map((s) => `${sevCount[s]} ${s.toLowerCase()}`).join(', ') || 'none'}) · ${review.length} need review</td></tr>
  <tr><th>Final status</th><td><b style="color:${statusColor}">${status}</b></td></tr></table>
  <h4>Major problems requiring attention</h4>${majors.length ? `<ul>${majors.map((i) => `<li><b>${esc(i.issueKey)}</b> (${esc(i.severity)}) ${esc(i.title)}</li>`).join('')}</ul>` : '<p>No critical or high-severity issues.</p>'}
  <h4>Recommended fixes</h4>${fixes.length ? `<ul>${fixes.map(([c, f]) => `<li><b>${esc(c)}:</b> ${esc(f)}</li>`).join('')}</ul>` : '<p>None.</p>'}
  <h4>Scope and limitations</h4><ul>${limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>
  </body></html>`;

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const slug = run.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site';
  const rel = `reports/${runId}/AWT-Report-${slug}-${stamp}.pdf`;
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    // The report is self-contained (data URIs); block all network access while rendering.
    await page.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4', printBackground: true, displayHeaderFooter: true, margin: { top: '22mm', bottom: '18mm', left: '14mm', right: '14mm' },
      headerTemplate: `<div style="font:8px 'Segoe UI',sans-serif;color:#727568;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>Autonomous Web Tester — ${esc(run.project.name)}</span><span>${esc(run.project.baseUrl)}</span></div>`,
      footerTemplate: `<div style="font:8px 'Segoe UI',sans-serif;color:#727568;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>Run ${esc(run.id.slice(0, 8))} · ${fmt(run.startedAt)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
    const full = join(storageRoot, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, pdf);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const rep = await db.report.create({ data: { runId, format: 'PDF', storagePath: rel, sizeBytes: pdf.length, generatedById: run.startedById } });
    return { reportId: rep.id, storagePath: rel, sizeBytes: pdf.length, pages };
  } finally {
    await browser.close();
  }
}
