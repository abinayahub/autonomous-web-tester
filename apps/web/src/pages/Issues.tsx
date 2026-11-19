import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Bug, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, Images, ListOrdered, Maximize2, ShieldQuestion, Shuffle, Target, XCircle, CheckCircle2 } from 'lucide-react';
import { ClassificationBadge, IssueStatusBadge, SeverityBadge, issueStatusLabel, severityLabel } from '../components/badges';
import { EmptyState, Notice, useToast } from '../components/feedback';
import { RevealImg } from '../components/motion';
import { SearchInput, Select, Tabs } from '../components/forms';
import { Lightbox } from '../components/Lightbox';
import { ButtonLink, Card, CardHeader, DemoTag, PageHeader, cx } from '../components/ui';
import { MODULES, VIEWPORTS, moduleInfo } from '../lib/catalog';
import { formatDate, relativeTime } from '../lib/format';
import { useData, useStore } from '../lib/store';
import { ISSUE_STATUSES, SEVERITIES, type Classification, type Issue, type IssueStatus } from '../lib/types';

const SEV_ORDER = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

export function Thumb({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  return src ? (
    <RevealImg src={src} alt={alt} loading="lazy" className={cx('rounded-md bg-slate-100 object-cover object-top ring-1 ring-slate-200', className)} />
  ) : (
    <span className={cx('grid place-items-center rounded-md bg-slate-100 text-slate-400', className)}><ImageIcon className="size-4" /></span>
  );
}

export function Issues() {
  const data = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const severity = params.get('severity') ?? '';
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const project = params.get('project') ?? '';
  const cls = (params.get('class') ?? 'CONFIRMED') as Classification | 'ALL';

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const shotSrc = (i: Issue) => data.screenshots.find((s) => s.id === i.screenshotIds[0])?.src;
  const base = data.issues.filter((i) => !project || i.projectId === project);
  const counts = { CONFIRMED: 0, FLAKY: 0, NEEDS_REVIEW: 0 } as Record<Classification, number>;
  base.forEach((i) => counts[i.classification]++);

  const rows = useMemo(
    () =>
      base
        .filter((i) => (cls === 'ALL' || i.classification === cls) && (!severity || i.severity === severity) && (!status || i.status === status) && (!category || i.module === category))
        .filter((i) => !q.trim() || `${i.key} ${i.title} ${i.pageName} ${i.pageUrl}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => SEV_ORDER[a.severity]! - SEV_ORDER[b.severity]! || b.detectedAt.localeCompare(a.detectedAt)),
    [base, cls, severity, status, category, q],
  );
  const filtered = !!(q || severity || status || category || project);

  return (
    <>
      <PageHeader title="Issues" description="Bug reports found by test runs. Confirmed issues are reproducible and backed by screenshots and measured evidence; flaky and AI-only findings are kept separate." />

      {data.issues.length === 0 ? (
        <Card>
          <EmptyState icon={Bug} title="No issues reported yet" action={<ButtonLink to="/configure">Configure a test</ButtonLink>}>
            Issues appear here after a test run finds a reproducible problem. Nothing is shown until real evidence exists — switch on <strong>Demo data</strong> to preview the layout.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <div className="space-y-3 border-b border-slate-100 p-4">
            <Tabs
              value={cls}
              onChange={(v) => setParam('class', v === 'CONFIRMED' ? '' : v)}
              items={[
                { value: 'CONFIRMED', label: 'Confirmed', count: counts.CONFIRMED, icon: CheckCircle2 },
                { value: 'NEEDS_REVIEW', label: 'Needs review', count: counts.NEEDS_REVIEW, icon: ShieldQuestion },
                { value: 'FLAKY', label: 'Flaky', count: counts.FLAKY, icon: Shuffle },
                { value: 'ALL', label: 'All', count: base.length },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={q} onChange={(v) => setParam('q', v)} placeholder="Search ID, title or page" className="w-full sm:w-64" />
              <Select aria-label="Severity" value={severity} onChange={(e) => setParam('severity', e.target.value)} className="w-[calc(50%-4px)] sm:w-40">
                <option value="">All severities</option>
                {SEVERITIES.map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}
              </Select>
              <Select aria-label="Status" value={status} onChange={(e) => setParam('status', e.target.value)} className="w-[calc(50%-4px)] sm:w-40">
                <option value="">All statuses</option>
                {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{issueStatusLabel(s)}</option>)}
              </Select>
              <Select aria-label="Category" value={category} onChange={(e) => setParam('category', e.target.value)} className="w-[calc(50%-4px)] sm:w-48">
                <option value="">All categories</option>
                {MODULES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
              <Select aria-label="Project" value={project} onChange={(e) => setParam('project', e.target.value)} className="w-[calc(50%-4px)] sm:w-52">
                <option value="">All projects</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              {filtered && <button onClick={() => setParams(cls === 'CONFIRMED' ? {} : { class: cls }, { replace: true })} className="px-2 text-sm font-medium text-brand-600 hover:text-brand-500">Clear filters</button>}
              <span className="ml-auto text-xs text-slate-500">{rows.length} issue{rows.length === 1 ? '' : 's'}</span>
            </div>
            {cls === 'NEEDS_REVIEW' && <Notice kind="info" className="text-xs">AI observations without deterministic confirmation. Verify them manually — they are not counted as bugs.</Notice>}
            {cls === 'FLAKY' && <Notice kind="warn" className="text-xs">Failed, then passed on retry. Shown separately and never counted as confirmed bugs.</Notice>}
          </div>

          {rows.length === 0 ? (
            <EmptyState compact icon={Bug} title="No issues match these filters" />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="app-table min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <th className="px-5 py-3">Issue</th>
                    <th className="hidden px-4 py-3 md:table-cell">Page</th>
                    <th className="hidden px-4 py-3 lg:table-cell">Category</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((i) => {
                    const mod = moduleInfo(i.module);
                    return (
                      <tr key={i.id} onClick={() => navigate(`/issues/${i.id}`)} className="cursor-pointer">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Thumb src={shotSrc(i)} alt={`Screenshot for ${i.key}`} className="h-14 w-22 shrink-0" />
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-mono text-xs text-slate-500">{i.key}{i.demo && <DemoTag />}{i.classification !== 'CONFIRMED' && <ClassificationBadge c={i.classification} />}</p>
                              <Link to={`/issues/${i.id}`} onClick={(e) => e.stopPropagation()} className="mt-0.5 line-clamp-1 font-medium text-slate-900 hover:text-brand-600">{i.title}</Link>
                              <p className="mt-0.5 text-xs text-slate-500 md:hidden">{i.pageName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <p className="text-slate-800">{i.pageName}</p>
                          <p className="max-w-56 truncate text-xs text-slate-500">{new URL(i.pageUrl).pathname}</p>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-slate-700 lg:table-cell"><span className="inline-flex items-center gap-1.5"><mod.icon className="size-4 text-slate-400" />{mod.name}</span></td>
                        <td className="px-4 py-3"><SeverityBadge s={i.severity} /></td>
                        <td className="hidden px-4 py-3 sm:table-cell"><IssueStatusBadge s={i.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

export function IssueDetail() {
  const { id } = useParams();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const [viewer, setViewer] = useState<number>();
  const issue = data.issues.find((i) => i.id === id);

  if (!issue) {
    return (
      <Card>
        <EmptyState icon={Bug} title="Issue not found" action={<ButtonLink to="/issues" icon={ArrowLeft}>Back to issues</ButtonLink>}>
          It may belong to demo data that is currently switched off.
        </EmptyState>
      </Card>
    );
  }

  const project = data.project(issue.projectId);
  const shots = issue.screenshotIds.map((sid) => data.screenshots.find((s) => s.id === sid)).filter((s) => s !== undefined);
  const main = shots[0];
  const mod = moduleInfo(issue.module);
  const ordered = [...data.issues].sort((a, b) => SEV_ORDER[a.severity]! - SEV_ORDER[b.severity]!);
  const idx = ordered.findIndex((i) => i.id === issue.id);
  const prev = ordered[idx - 1];
  const next = ordered[idx + 1];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/issues" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" /> Issues</Link>
        <div className="flex gap-1">
          <ButtonLink to={prev ? `/issues/${prev.id}` : '#'} size="sm" variant="ghost" icon={ChevronLeft} aria-disabled={!prev} className={!prev ? 'pointer-events-none opacity-40' : undefined}>Previous</ButtonLink>
          <ButtonLink to={next ? `/issues/${next.id}` : '#'} size="sm" variant="ghost" aria-disabled={!next} className={!next ? 'pointer-events-none opacity-40' : undefined}>Next <ChevronRight className="size-3.5" /></ButtonLink>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-slate-500">{issue.key}</span>
          {issue.demo && <DemoTag />}
          <SeverityBadge s={issue.severity} />
          <ClassificationBadge c={issue.classification} />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.03em] text-slate-900">{issue.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{issue.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="issue-status" className="text-sm text-slate-500">Status</label>
            <Select
              id="issue-status"
              value={issue.status}
              className="w-44"
              onChange={(e) => {
                store.setIssueStatus(issue.id, e.target.value as IssueStatus);
                toast({ kind: 'success', title: `Marked as ${issueStatusLabel(e.target.value as IssueStatus).toLowerCase()}`, body: issue.demo ? 'Demo issue — change kept in this browser only.' : undefined });
              }}
            >
              {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{issueStatusLabel(s)}</option>)}
            </Select>
          </div>
        </div>
      </div>

      {issue.classification === 'NEEDS_REVIEW' && <Notice kind="info" className="mb-6" title="Needs review">AI vision observation without deterministic corroboration. Verify it manually before treating it as a bug.</Notice>}
      {issue.classification === 'FLAKY' && <Notice kind="warn" className="mb-6" title="Flaky">Failed, then passed on retry. Not counted as a confirmed bug.</Notice>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader title="Screenshot evidence" icon={Images} action={shots.length > 0 && <Link to={`/screenshots?issue=${issue.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-500">Open in gallery</Link>} />
            {main ? (
              <div className="p-5">
                <button onClick={() => setViewer(0)} className="group relative block w-full overflow-hidden rounded-lg ring-1 ring-slate-200" aria-label="View screenshot full screen">
                  <RevealImg src={main.src} alt={main.label} className="w-full bg-slate-50 object-contain group-hover:scale-[1.01]" style={{ maxHeight: 460 }} />
                  <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-slate-900/75 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><Maximize2 className="size-3.5" /> Full screen</span>
                </button>
                {shots.length > 1 && (
                  <div className="mt-3 flex gap-3 overflow-x-auto">
                    {shots.map((s, i) => (
                      <button key={s.id} onClick={() => setViewer(i)} className="group shrink-0 text-left">
                        <Thumb src={s.src} alt={s.label} className="h-20 w-32 transition group-hover:ring-brand-400" />
                        <span className="mt-1 block text-xs font-medium text-slate-600">{s.kind === 'BEFORE' ? 'Before action' : s.kind === 'AFTER' ? 'After action' : 'Issue highlight'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState compact icon={ImageIcon} title="No screenshot attached" />
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Expected result" icon={CheckCircle2} />
              <p className="p-5 text-sm leading-relaxed text-slate-700">{issue.expected}</p>
            </Card>
            <Card className="border-rose-200/70">
              <CardHeader title="Actual result" icon={XCircle} />
              <p className="p-5 text-sm leading-relaxed text-slate-700">{issue.actual}</p>
            </Card>
          </div>

          <Card>
            <CardHeader title="Steps to reproduce" icon={ListOrdered} />
            <ol className="stagger space-y-3 p-5">
              {issue.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ['Issue ID', <span key="k" className="font-mono">{issue.key}</span>],
                ['Project', project ? <Link key="p" to={`/projects/${project.id}`} className="text-brand-600 hover:underline">{project.name}</Link> : '—'],
                ['Page', <a key="u" href={issue.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">{issue.pageName}<ExternalLink className="size-3" /></a>],
                ['Category', <span key="c" className="inline-flex items-center gap-1.5"><mod.icon className="size-4 text-slate-400" />{mod.name}</span>],
                ['Severity', <SeverityBadge key="s" s={issue.severity} />],
                ['Status', <IssueStatusBadge key="st" s={issue.status} />],
                ['Device', `${VIEWPORTS.find((v) => v.id === issue.viewport)?.label ?? issue.device} (${VIEWPORTS.find((v) => v.id === issue.viewport)?.size ?? ''})`],
                ['Browser', issue.browser],
                ['Detected', <span key="d" title={formatDate(issue.detectedAt)}>{relativeTime(issue.detectedAt)}</span>],
              ].map(([k, v]) => (
                <div key={k as string} className="grid grid-cols-[96px_1fr] gap-3 px-5 py-2.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="min-w-0 break-words text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {issue.element && (
            <Card>
              <CardHeader title="Element" icon={Target} />
              <div className="p-5"><code className="block break-all rounded-lg bg-slate-950 p-3 font-mono text-xs text-emerald-300">{issue.element}</code></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Page URL" />
            <p className="break-all p-5 font-mono text-xs text-slate-600">{issue.pageUrl}</p>
          </Card>
        </div>
      </div>

      {viewer !== undefined && <Lightbox items={shots} index={viewer} onIndex={setViewer} onClose={() => setViewer(undefined)} />}
    </>
  );
}
