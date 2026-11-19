import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Bug, CheckCircle2, ExternalLink, FileStack, FileText, FolderKanban, KeyRound, LayoutGrid, List, Pencil, Play, Plus, Radar, ShieldCheck, SlidersHorizontal, Trash2, XCircle } from 'lucide-react';
import { EnvBadge, ModuleBadge, ProjectStatusBadge, RunStatusBadge } from '../components/badges';
import { EmptyState, Modal, Notice, useToast } from '../components/feedback';
import { SearchInput, Select, Tabs } from '../components/forms';
import { Button, ButtonLink, Card, CardHeader, DemoTag, IconButton, PageHeader, SiteIcon, StatCard, cx } from '../components/ui';
import { AUTH_INFO, VIEWPORTS } from '../lib/catalog';
import { duration, formatDate, num, relativeTime } from '../lib/format';
import { useLiveRun } from '../lib/live';
import { projectStats, useData, useStore } from '../lib/store';
import type { Project, ProjectStatus } from '../lib/types';
import { RunPanel, ServerRunBadge, reportUrl } from '../components/RunPanel';
import { isActive, useServerProject, useServerRuns, type ServerRun } from '../lib/remote';

/** Project status from the latest real run. */
function serverStatus(latest?: ServerRun): ProjectStatus {
  if (!latest) return 'NOT_TESTED';
  if (isActive(latest)) return 'TESTING';
  if (latest.status === 'FAILED') return 'FAILED';
  if (latest.status === 'COMPLETED') return latest.confirmedIssues > 0 ? 'ISSUES_FOUND' : 'PASSED';
  return 'NOT_TESTED';
}

const STATUS_FILTERS: Array<{ value: ProjectStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'NOT_TESTED', label: 'Not tested yet' },
  { value: 'TESTING', label: 'Testing' },
  { value: 'PASSED', label: 'Passing' },
  { value: 'ISSUES_FOUND', label: 'Issues found' },
  { value: 'FAILED', label: 'Run failed' },
];

function DeleteProjectModal({ project, onClose }: { project?: Project; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <Modal
      open={!!project}
      onClose={onClose}
      size="sm"
      title="Delete project?"
      description={project && `"${project.name}" and its test configuration will be removed from this browser.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={Trash2} onClick={() => {
            if (!project) return;
            store.deleteProject(project.id);
            toast({ kind: 'success', title: 'Project deleted', body: project.name });
            onClose();
            navigate('/projects');
          }}>Delete project</Button>
        </>
      }
    />
  );
}

export function Projects() {
  const data = useData();
  const { run: live } = useLiveRun();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [toDelete, setToDelete] = useState<Project>();

  const rows = useMemo(
    () =>
      data.projects
        .map((p) => ({ p, st: projectStats(p, data, live?.project.id === p.id && live.status === 'RUNNING') }))
        .filter(({ p, st }) => (!status || st.status === status) && `${p.name} ${p.url}`.toLowerCase().includes(q.trim().toLowerCase())),
    [data, q, status, live],
  );

  return (
    <>
      <PageHeader
        title="Projects"
        description="Websites you're authorized to test. Each project holds its URL, environment, logins and test configuration."
        actions={<ButtonLink to="/projects/new" variant="primary" icon={Plus}>Add new project</ButtonLink>}
      />

      {data.projects.length === 0 ? (
        <Card>
          <EmptyState icon={FolderKanban} title="No projects yet" action={<ButtonLink to="/projects/new" variant="primary" icon={Plus}>Add your first website</ButtonLink>}>
            Add a website you own or have permission to test. You can also switch on <strong>Demo data</strong> in the top bar to preview sample projects.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <SearchInput value={q} onChange={setQ} placeholder="Search by name or URL" className="w-full sm:w-72" />
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')} className="w-full sm:w-48" aria-label="Filter by status">
              {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <span className="ml-auto text-xs text-slate-500">{rows.length} of {data.projects.length}</span>
            <Tabs value={view} onChange={setView} items={[{ value: 'table', label: <List className="size-4" aria-label="Table view" /> }, { value: 'grid', label: <LayoutGrid className="size-4" aria-label="Card view" /> }]} />
          </div>

          {rows.length === 0 ? (
            <EmptyState compact icon={FolderKanban} title="No projects match" action={<Button size="sm" onClick={() => { setQ(''); setStatus(''); }}>Clear filters</Button>} />
          ) : view === 'table' ? (
            <div className="relative overflow-x-auto">
              <table className="app-table min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <th className="px-5 py-3">Website</th>
                    <th className="px-4 py-3">Environment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last tested</th>
                    <th className="px-4 py-3 text-right">Open issues</th>
                    <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(({ p, st }) => (
                    <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <SiteIcon name={p.name} demo={p.demo} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-medium text-slate-900">
                              <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="truncate hover:text-brand-600">{p.name}</Link>
                              {p.demo && <DemoTag />}
                            </p>
                            <p className="truncate text-xs text-slate-500">{p.url}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><EnvBadge e={p.environment} /></td>
                      <td className="px-4 py-3.5"><ProjectStatusBadge s={st.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{st.lastTested ? <span title={formatDate(st.lastTested)}>{relativeTime(st.lastTested)}</span> : <span className="text-slate-400">Never</span>}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{st.runs.length ? st.openIssues : '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <ButtonLink to={`/projects/${p.id}/configure`} size="sm" variant="ghost" icon={SlidersHorizontal}>Configure</ButtonLink>
                          <ButtonLink to={`/projects/${p.id}`} size="sm" variant="secondary">View</ButtonLink>
                          {!p.demo && <IconButton icon={Trash2} label={`Delete ${p.name}`} className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setToDelete(p)} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="stagger grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map(({ p, st }) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="app-surface group rounded-2xl p-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-slate-300 hover:shadow-card-hover">
                  <div className="flex items-start gap-3">
                    <span className="transition-transform duration-300 ease-out group-hover:-rotate-3 group-hover:scale-105"><SiteIcon name={p.name} demo={p.demo} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-semibold text-slate-900 transition-colors group-hover:text-brand-600">{p.name}{p.demo && <DemoTag />}</p>
                      <p className="truncate text-xs text-slate-500">{p.url}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2"><ProjectStatusBadge s={st.status} /><EnvBadge e={p.environment} /></div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                    <div><p className="text-lg font-semibold text-slate-900">{st.latest ? st.latest.pagesDiscovered : '—'}</p><p className="text-[11px] text-slate-500">Pages</p></div>
                    <div><p className="text-lg font-semibold text-slate-900">{st.runs.length}</p><p className="text-[11px] text-slate-500">Runs</p></div>
                    <div><p className="text-lg font-semibold text-slate-900">{st.runs.length ? st.openIssues : '—'}</p><p className="text-[11px] text-slate-500">Open issues</p></div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{st.lastTested ? `Last tested ${relativeTime(st.lastTested)}` : 'Not tested yet'}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}
      <DeleteProjectModal project={toDelete} onClose={() => setToDelete(undefined)} />
    </>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const data = useData();
  const { run: live } = useLiveRun();
  const [toDelete, setToDelete] = useState<Project>();
  const project = data.project(id);
  const [search] = useSearchParams();
  const server = useServerProject(project);
  const runsRes = useServerRuns(server.id);
  const realRuns = runsRes.data?.items ?? [];

  if (!project) {
    return (
      <Card>
        <EmptyState icon={FolderKanban} title="Project not found" action={<ButtonLink to="/projects" icon={ArrowLeft}>Back to projects</ButtonLink>}>
          It may have been deleted, or it's a demo project and Demo data is switched off.
        </EmptyState>
      </Card>
    );
  }

  const st = projectStats(project, data, live?.project.id === project.id && live.status === 'RUNNING');
  const config = data.configFor(project.id);
  const issues = data.issues.filter((i) => i.projectId === project.id);
  const latest = st.latest;
  // Real projects: everything below comes from PostgreSQL (runs recorded by the engine).
  const real = !project.demo;
  const realLatest = realRuns[0];
  const realDone = realRuns.find((r) => r.status === 'COMPLETED');
  const status = real ? serverStatus(realLatest) : st.status;
  const focusRun = search.get('run') ?? (realLatest && isActive(realLatest) ? realLatest.id : undefined);

  return (
    <>
      <Link to="/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" /> Projects</Link>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <SiteIcon name={project.name} demo={project.demo} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 font-display text-[26px] font-bold tracking-[-0.03em] text-slate-900">{project.name}{project.demo && <DemoTag />}</h1>
          <a href={project.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">{project.url}<ExternalLink className="size-3.5" /></a>
          <div className="mt-2 flex flex-wrap gap-2"><ProjectStatusBadge s={status} /><EnvBadge e={project.environment} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!project.demo && <Button icon={Trash2} variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setToDelete(project)}>Delete</Button>}
          {!project.demo && <ButtonLink to={`/projects/${project.id}/edit`} icon={Pencil}>Edit</ButtonLink>}
          <ButtonLink to={`/projects/${project.id}/configure`} variant="primary" icon={Play}>Configure &amp; start</ButtonLink>
        </div>
      </div>

      {real && runsRes.error && <Notice kind="error" className="mb-4" title="Test results could not be loaded">{runsRes.error.message}</Notice>}
      {real && focusRun && <div className="mb-6"><RunPanel key={focusRun} runId={focusRun} onChange={runsRes.reload} /></div>}

      {real ? (
        <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Pages discovered" value={realDone ? realDone.pagesDiscovered : '—'} icon={FileStack} iconCls="bg-violet-50 text-violet-600" hint={realDone ? 'Latest completed run' : 'Not tested yet'} />
          <StatCard label="Tests passed" value={realDone ? realDone.testsPassed : '—'} icon={CheckCircle2} iconCls="bg-emerald-50 text-emerald-600" hint={realDone ? `of ${realDone.testsTotal} checks` : 'Not tested yet'} />
          <StatCard label="Tests failed" value={realDone ? realDone.testsFailed : '—'} icon={XCircle} iconCls="bg-rose-50 text-rose-600" hint={realDone ? `${realDone.reviewItems} to review` : 'Not tested yet'} />
          <StatCard label="Issues found" value={realDone ? realDone.confirmedIssues : '—'} icon={Bug} iconCls="bg-amber-50 text-amber-600" hint={realDone ? 'Confirmed, with evidence' : 'Not tested yet'} />
        </div>
      ) : (
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard demo={project.demo} label="Pages discovered" value={latest ? num(latest.pagesDiscovered) : '—'} icon={FileStack} iconCls="bg-violet-50 text-violet-600" hint={latest ? 'Latest run' : 'Not tested yet'} />
        <StatCard demo={project.demo} label="Tests passed" value={latest ? num(latest.testsPassed) : '—'} icon={CheckCircle2} iconCls="bg-emerald-50 text-emerald-600" hint={latest ? 'Latest run' : 'Not tested yet'} />
        <StatCard demo={project.demo} label="Tests failed" value={latest ? num(latest.testsFailed) : '—'} icon={XCircle} iconCls="bg-rose-50 text-rose-600" hint={latest ? `${latest.testsFlaky} flaky` : 'Not tested yet'} />
        <StatCard demo={project.demo} label="Open issues" value={st.runs.length ? num(st.openIssues) : '—'} icon={Bug} iconCls="bg-amber-50 text-amber-600" to={`/issues?project=${project.id}`} hint={`${issues.length} total`} />
      </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {real ? (
        <Card className="xl:col-span-2">
          <CardHeader title="Test runs" icon={Radar} description={realRuns.length ? `${realRuns.length} run${realRuns.length === 1 ? '' : 's'} recorded` : undefined} />
          {runsRes.loading && !runsRes.data ? (
            <p className="p-5 text-sm text-slate-500">Loading test runs…</p>
          ) : realRuns.length === 0 ? (
            <EmptyState compact icon={Radar} title="No test runs yet" action={<ButtonLink to={`/projects/${project.id}/configure`} variant="primary" size="sm" icon={Play}>Configure &amp; start</ButtonLink>}>
              Start a test from the configuration page. Its progress and results appear here.
            </EmptyState>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="app-table min-w-full text-sm">
                <thead><tr className="border-b border-slate-200/80 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"><th className="px-5 py-2.5">Started</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Pages</th><th className="px-4 py-2.5 text-right">Passed</th><th className="px-4 py-2.5 text-right">Failed</th><th className="px-4 py-2.5 text-right">Issues</th><th className="px-4 py-2.5 text-right">Duration</th><th className="px-5 py-2.5 text-right">Report</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {realRuns.map((r) => (
                    <tr key={r.id} className={cx(r.id === focusRun && 'bg-brand-50/40')}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-700"><Link to={`/projects/${project.id}?run=${r.id}`} className="hover:text-brand-600">{formatDate(r.startedAt ?? r.queuedAt)}</Link></td>
                      <td className="px-4 py-3"><ServerRunBadge s={r.status} /></td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.pagesDiscovered}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.testsPassed}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.testsFailed}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.confirmedIssues}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-500">{r.startedAt ? duration(r.startedAt, r.finishedAt) : '—'}</td>
                      <td className="px-5 py-3 text-right">{reportUrl(r) ? <a href={reportUrl(r)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"><FileText className="size-3.5" /> PDF</a> : <span className="text-slate-400">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        ) : (
        <Card className="xl:col-span-2">
          <CardHeader title="Test runs" icon={Radar} action={st.runs.length > 0 && <ButtonLink to={`/reports?project=${project.id}`} size="sm">View report</ButtonLink>} />
          {st.runs.length === 0 ? (
            <EmptyState compact icon={Radar} title="No test runs yet" action={<ButtonLink to={`/projects/${project.id}/configure`} variant="primary" size="sm" icon={SlidersHorizontal}>Configure tests</ButtonLink>}>
              Runs will appear here once the test engine is connected.
            </EmptyState>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="app-table min-w-full text-sm">
                <thead><tr className="border-b border-slate-200/80 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"><th className="px-5 py-2.5">Started</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Pages</th><th className="px-4 py-2.5 text-right">Passed</th><th className="px-4 py-2.5 text-right">Failed</th><th className="px-4 py-2.5 text-right">Issues</th><th className="px-5 py-2.5 text-right">Duration</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {st.runs.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-700">{formatDate(r.startedAt)}</td>
                      <td className="px-4 py-3"><RunStatusBadge s={r.status} /></td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.pagesDiscovered}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.testsPassed}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.testsFailed}</td>
                      <td className="px-4 py-3 text-right tabular-nums"><Link className="text-brand-600 hover:underline" to={`/issues?project=${project.id}`}>{r.issuesFound}</Link></td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-slate-500">{duration(r.startedAt, r.finishedAt ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        )}

        <div className="space-y-6">
          <Card>
            <CardHeader title="Test configuration" icon={SlidersHorizontal} action={<Link to={`/projects/${project.id}/configure`} className="text-sm font-medium text-brand-600 hover:text-brand-500">Edit</Link>} />
            <div className="space-y-4 p-5 text-sm">
              <div className="flex flex-wrap gap-1.5">{config.modules.map((m) => <ModuleBadge key={m} m={m} />)}</div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-slate-500">Viewports</dt><dd className="mt-0.5 font-medium text-slate-800">{config.viewports.map((v) => VIEWPORTS.find((x) => x.id === v)?.label).join(', ')}</dd></div>
                <div><dt className="text-slate-500">Crawl limits</dt><dd className="mt-0.5 font-medium text-slate-800">{config.maxPages} pages · depth {config.maxDepth}</dd></div>
              </dl>
            </div>
          </Card>
          <Card>
            <CardHeader title="Authentication" icon={KeyRound} />
            <div className="space-y-3 p-5 text-sm">
              <p className="font-medium text-slate-800">{AUTH_INFO[project.authType].label}</p>
              {project.credentials.length === 0 ? (
                <p className="text-slate-500">Public pages only.</p>
              ) : (
                <ul className="stagger space-y-2">
                  {project.credentials.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{c.roleName}</span><span className="block truncate text-slate-800">{c.username || c.headerName}</span></span>
                      <span className="text-xs text-slate-400">secret: ••••••</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-600" /> Authorization confirmed {formatDate(project.authorizationConfirmedAt)}</p>
            </div>
          </Card>
          {!project.demo && project.credentials.some((c) => c.secretProvided) && (
            <Notice kind="info" className="text-xs">Passwords and tokens are never saved in the browser, so runs started here test public pages only.</Notice>
          )}
        </div>
      </div>
      {issues.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Latest issues" icon={Bug} action={<Link to={`/issues?project=${project.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-500">View all {issues.length}</Link>} />
          <ul className="stagger divide-y divide-slate-100">
            {issues.slice(0, 5).map((i) => (
              <li key={i.id}>
                <Link to={`/issues/${i.id}`} className={cx('flex items-center gap-3 px-5 py-3 text-sm transition-colors duration-200 hover:bg-slate-50')}>
                  <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{i.key}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{i.title}</span>
                  <span className="hidden text-xs text-slate-500 sm:block">{i.pageName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <DeleteProjectModal project={toDelete} onClose={() => setToDelete(undefined)} />
    </>
  );
}
