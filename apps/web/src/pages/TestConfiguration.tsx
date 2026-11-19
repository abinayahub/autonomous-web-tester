import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Check, FolderKanban, Info, Lock, Play, Plus, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { EmptyState, Modal, Notice, useToast } from '../components/feedback';
import { Field, Input, PasswordInput, Select, Toggle } from '../components/forms';
import { Button, ButtonLink, Card, CardHeader, DemoTag, PageHeader, cx } from '../components/ui';
import { ALL_MODULES, MODULES, VIEWPORTS } from '../lib/catalog';
import { useLiveRun } from '../lib/live';
import { useData, useStore } from '../lib/store';
import { ApiError } from '../lib/api';
import { describeStartError, isActive, startServerRun, useServerProject, useServerRuns, type TestLoginInput } from '../lib/remote';
import type { ModuleId, TestConfig, ViewportId } from '../lib/types';

export function TestConfiguration() {
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const data = useData();
  const store = useStore();
  const live = useLiveRun();
  const toast = useToast();
  const navigate = useNavigate();
  const projectId = params.id ?? search.get('project') ?? data.projects[0]?.id;
  const project = data.project(projectId);
  const [cfg, setCfg] = useState<TestConfig>(() => (project ? data.configFor(project.id) : data.configFor('')));
  const [dirty, setDirty] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  const server = useServerProject(project);
  const serverRuns = useServerRuns(server.id);
  const activeServerRun = serverRuns.data?.items.find(isActive);
  // Test logins: passwords are never stored in the browser. The server keeps them encrypted once sent.
  const [loginOpen, setLoginOpen] = useState(false);
  const [logins, setLogins] = useState<TestLoginInput[]>([]);
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (project) setCfg(data.configFor(project.id));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when switching project
  }, [project?.id]);

  if (data.projects.length === 0 || !project) {
    return (
      <>
        <PageHeader title="Test configuration" description="Choose what the autonomous tester checks on each website." />
        <Card>
          <EmptyState icon={FolderKanban} title={data.projects.length === 0 ? 'Add a website first' : 'Project not found'} action={<ButtonLink to="/projects/new" variant="primary" icon={Plus}>Add website</ButtonLink>}>
            Test configurations belong to a project. Add the website you want to test, then come back here.
          </EmptyState>
        </Card>
      </>
    );
  }

  const set = (patch: Partial<TestConfig>) => { setCfg((c) => ({ ...c, ...patch })); setDirty(true); };
  const toggleModule = (m: ModuleId) => set({ modules: cfg.modules.includes(m) ? cfg.modules.filter((x) => x !== m) : ALL_MODULES.filter((x) => x === m || cfg.modules.includes(x)) });
  const toggleViewport = (v: ViewportId) => set({ viewports: cfg.viewports.includes(v) ? cfg.viewports.filter((x) => x !== v) : VIEWPORTS.map((x) => x.id).filter((x) => x === v || cfg.viewports.includes(x)) });
  const valid = cfg.modules.length > 0 && cfg.viewports.length > 0 && cfg.maxPages >= 1 && cfg.maxDepth >= 1;
  const running = project.demo ? live.run?.status === 'RUNNING' || live.run?.status === 'STOPPING' : !!activeServerRun;

  function save(quiet = false) {
    if (project!.demo) {
      if (!quiet) toast({ kind: 'info', title: 'Demo projects use a fixed configuration', body: 'Changes apply to this session only.' });
      setDirty(false);
      return;
    }
    store.saveConfig(project!.id, cfg);
    store.logActivity({ kind: 'CONFIG_SAVED', message: `${project!.name} — test configuration saved (${cfg.modules.length} modules)`, projectId: project!.id, link: `/projects/${project!.id}/configure` });
    setDirty(false);
    if (!quiet) toast({ kind: 'success', title: 'Configuration saved', body: `${cfg.modules.length} modules · ${cfg.viewports.length} viewports` });
  }

  const formLogins = project.authType === 'FORM' ? project.credentials : [];
  const missingRoles = formLogins.filter((c) => !server.storedRoles.includes(c.roleName));

  function openLogins(all: boolean) {
    const base = all || !missingRoles.length ? formLogins : missingRoles;
    setLogins(base.length
      ? base.map((c) => ({ roleName: c.roleName, username: c.username, password: '', loginUrl: c.loginUrl ?? '', successIndicator: '' }))
      : [{ roleName: 'user', username: '', password: '', loginUrl: '', successIndicator: '' }]);
    setLoginErrors({});
    setLoginOpen(true);
  }

  function submitLogins() {
    const errs: Record<string, string> = {};
    logins.forEach((l, i) => {
      if (!l.roleName.trim()) errs[`${i}.role`] = 'Enter a role name';
      if (!l.username.trim()) errs[`${i}.user`] = 'Enter the username or email';
      if (!l.password) errs[`${i}.pw`] = 'Enter the password';
      if (l.loginUrl) {
        try {
          if (new URL(l.loginUrl).hostname !== new URL(project!.url).hostname) errs[`${i}.url`] = 'Must be on the same website';
        } catch {
          errs[`${i}.url`] = 'Enter a full URL';
        }
      }
    });
    setLoginErrors(errs);
    if (Object.keys(errs).length) return;
    setLoginOpen(false);
    void start(logins);
  }

  async function start(credentials: TestLoginInput[] = []) {
    if (!valid || starting) return;
    // A test login exists for this project but the server doesn't hold its password yet → ask for it first.
    if (!project!.demo && !credentials.length && missingRoles.length) {
      openLogins(false);
      return;
    }
    if (project!.demo) {
      live.start(project!, cfg);
      navigate('/live');
      return;
    }
    if (dirty) save(true);
    setStarting(true);
    setStartError(undefined);
    try {
      // Creates the run in PostgreSQL and queues the job; navigation happens only after the server confirms.
      const r = await startServerRun(project!, cfg, credentials);
      store.updateProject(project!.id, { remoteProjectId: r.projectId });
      store.logActivity({ kind: 'RUN_STARTED', message: `${project!.name} — test run started (${cfg.modules.length} modules, ${cfg.viewports.length} viewports)`, projectId: project!.id, link: `/projects/${project!.id}` });
      if (credentials.length) server.reload();
      toast({ kind: 'success', title: 'Testing started', body: `Run ${r.runId.slice(0, 8)} is queued${credentials.length ? ` with ${credentials.length} test login${credentials.length === 1 ? '' : 's'}` : ''} — progress is shown on the project page.` });
      navigate(`/projects/${project!.id}?run=${r.runId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast({ kind: 'info', title: 'A test is already running for this website', body: 'Showing its progress instead.' });
        navigate(`/projects/${project!.id}`);
        return;
      }
      const msg = describeStartError(e);
      setStartError(msg);
      toast({ kind: 'error', title: 'Testing could not start', body: msg });
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Test configuration"
        description="Choose what the autonomous tester checks. Settings are saved per project."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Project</span>
            <Select
              aria-label="Project"
              value={project.id}
              className="w-64"
              onChange={(e) => {
                if (params.id) navigate(`/projects/${e.target.value}/configure`);
                else setSearch({ project: e.target.value });
              }}
            >
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.demo ? ' (demo)' : ''}</option>)}
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Testing modules"
              description={`${cfg.modules.length} of ${MODULES.length} selected`}
              icon={SlidersHorizontal}
              action={
                <>
                  <Button size="sm" variant="ghost" onClick={() => set({ modules: ALL_MODULES })} disabled={cfg.modules.length === MODULES.length}>Select all</Button>
                  <Button size="sm" variant="ghost" onClick={() => set({ modules: [] })} disabled={cfg.modules.length === 0}>Clear</Button>
                </>
              }
            />
            <div className="stagger grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
              {MODULES.map((m) => {
                const on = cfg.modules.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className={cx('group flex cursor-pointer flex-col rounded-xl border p-4 transition-all duration-150', on ? 'border-brand-300 bg-brand-50/40 ring-1 ring-brand-300' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50')}
                    onClick={() => toggleModule(m.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cx('grid size-10 shrink-0 place-items-center rounded-lg transition-colors', on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
                        <m.icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{m.name} testing</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{m.description}</p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Toggle size="sm" checked={on} onChange={() => toggleModule(m.id)} label={undefined} />
                      </div>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-1.5 pl-13">
                      {m.checks.map((c) => (
                        <li key={c} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200"><Check className="size-3 text-slate-400" />{c}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            {cfg.modules.length === 0 && <p className="px-5 pb-5 text-sm font-medium text-rose-600">Select at least one module.</p>}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Viewports" description="Every page is rendered on each selected device" />
              <div className="grid gap-2 p-5">
                {VIEWPORTS.map((v) => {
                  const on = cfg.viewports.includes(v.id);
                  return (
                    <label key={v.id} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors', on ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 hover:bg-slate-50')}>
                      <input type="checkbox" checked={on} onChange={() => toggleViewport(v.id)} className="size-4 accent-brand-600" />
                      <v.icon className="size-4 text-slate-500" />
                      <span className="flex-1 text-sm font-medium text-slate-800">{v.label}</span>
                      <span className="text-xs tabular-nums text-slate-500">{v.size}</span>
                    </label>
                  );
                })}
                {cfg.viewports.length === 0 && <p className="text-sm font-medium text-rose-600">Select at least one viewport.</p>}
              </div>
            </Card>

            <Card>
              <CardHeader title="Crawl limits" description="Bound how much of the site is explored" />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                <Field label="Maximum pages" htmlFor="maxPages" hint="1 – 2,000">
                  <Input id="maxPages" type="number" min={1} max={2000} value={cfg.maxPages} onChange={(e) => set({ maxPages: Math.max(1, Math.min(2000, Number(e.target.value) || 1)) })} />
                </Field>
                <Field label="Maximum link depth" htmlFor="maxDepth" hint="Clicks from the start page, 1 – 15">
                  <Input id="maxDepth" type="number" min={1} max={15} value={cfg.maxDepth} onChange={(e) => set({ maxDepth: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })} />
                </Field>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Safety" description="Always enforced — cannot be turned off" icon={ShieldCheck} />
            <div className="stagger grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
              {[
                ['Approval before risky actions', 'Delete, purchase or other mutating actions pause until you approve.'],
                ['Stay on the authorized domain', 'Links to other hosts are recorded but never visited.'],
                ['Mask secrets in evidence', 'Password and card fields are blacked out in every screenshot.'],
              ].map(([t, d]) => (
                <div key={t} className="flex gap-3 rounded-lg bg-slate-50 p-3">
                  <Lock className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <div><p className="text-sm font-medium text-slate-800">{t}</p><p className="mt-0.5 text-xs text-slate-500">{d}</p></div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader title="Run summary" action={project.demo && <DemoTag />} />
            <div className="space-y-4 p-5 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{project.name}</p>
                <p className="truncate text-xs text-slate-500">{project.url}</p>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-100/70 p-3"><dt className="text-xs text-slate-500">Modules</dt><dd className="text-lg font-semibold text-slate-900">{cfg.modules.length}</dd></div>
                <div className="rounded-xl bg-slate-100/70 p-3"><dt className="text-xs text-slate-500">Viewports</dt><dd className="text-lg font-semibold text-slate-900">{cfg.viewports.length}</dd></div>
                <div className="rounded-xl bg-slate-100/70 p-3"><dt className="text-xs text-slate-500">Max pages</dt><dd className="text-lg font-semibold text-slate-900">{cfg.maxPages}</dd></div>
                <div className="rounded-xl bg-slate-100/70 p-3"><dt className="text-xs text-slate-500">Test logins</dt><dd className="text-lg font-semibold text-slate-900">{project.credentials.length}</dd></div>
              </dl>
              {dirty && <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700"><Info className="size-3.5" /> Unsaved changes</p>}
            </div>
            <div className="space-y-2 border-t border-slate-100 p-5">
              <Button variant="primary" size="lg" icon={Play} className="w-full" disabled={!valid || running} loading={starting} onClick={() => void start()}>
                {project.demo ? 'Start demo simulation' : 'Start testing'}
              </Button>
              <Button icon={Save} className="w-full" disabled={!dirty} onClick={() => save()}>Save configuration</Button>
              {running && <p className="text-center text-xs text-slate-500">A run is already in progress. <Link to={project.demo ? '/live' : `/projects/${project.id}`} className="font-medium text-brand-600">View it</Link></p>}
            </div>
          </Card>
          {!project.demo && startError && (
            <Notice kind="error" className="text-xs" title="Testing could not start">{startError}</Notice>
          )}
          <Modal
            open={loginOpen}
            onClose={() => setLoginOpen(false)}
            title="Test login"
            description="Sent once to the testing server and stored encrypted there — never saved in this browser, never shown in logs or reports."
            footer={<><Button onClick={() => setLoginOpen(false)}>Cancel</Button><Button variant="primary" icon={Play} onClick={submitLogins}>Sign in &amp; start testing</Button></>}
          >
            <div className="space-y-5">
              {logins.map((l, i) => {
                const set = (patch: Partial<TestLoginInput>) => setLogins((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Role" htmlFor={`lg-role-${i}`} required error={loginErrors[`${i}.role`]}><Input id={`lg-role-${i}`} value={l.roleName} onChange={(e) => set({ roleName: e.target.value })} /></Field>
                      <Field label="Username / email" htmlFor={`lg-user-${i}`} required error={loginErrors[`${i}.user`]}><Input id={`lg-user-${i}`} autoComplete="off" value={l.username} onChange={(e) => set({ username: e.target.value })} /></Field>
                    </div>
                    <Field label="Password" htmlFor={`lg-pw-${i}`} required error={loginErrors[`${i}.pw`]}><PasswordInput id={`lg-pw-${i}`} autoComplete="new-password" value={l.password} onChange={(e) => set({ password: e.target.value })} /></Field>
                    <Field label="Login page URL" optional htmlFor={`lg-url-${i}`} error={loginErrors[`${i}.url`]} hint="Leave empty to detect the sign-in form automatically.">
                      <Input id={`lg-url-${i}`} type="url" placeholder={`${(() => { try { return new URL(project.url).origin; } catch { return 'https://…'; } })()}/login`} value={l.loginUrl} onChange={(e) => set({ loginUrl: e.target.value })} />
                    </Field>
                    <Field label="Signed-in indicator" optional htmlFor={`lg-ind-${i}`} hint={'Text or CSS selector that only appears after signing in, e.g. "Dashboard" or #user-menu. Without it, a log-out link or account menu is used as proof.'}>
                      <Input id={`lg-ind-${i}`} value={l.successIndicator} onChange={(e) => set({ successIndicator: e.target.value })} />
                    </Field>
                  </div>
                );
              })}
            </div>
          </Modal>
          {!project.demo && (
            <Card>
              <CardHeader title="Test login" icon={Lock} description="Used to test pages behind sign-in" />
              <div className="space-y-3 p-5 text-sm">
                {project.authType !== 'NONE' && project.authType !== 'FORM' ? (
                  <p className="text-amber-800">This project uses {project.authType === 'BASIC' ? 'HTTP Basic' : 'token'} authentication. The testing engine currently signs in through login forms only, so runs test public pages.</p>
                ) : formLogins.length === 0 && server.storedRoles.length === 0 ? (
                  <p className="text-slate-500">No test login — public pages only.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {[...new Set([...formLogins.map((c) => c.roleName), ...server.storedRoles])].map((role) => (
                      <li key={role} className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{role}</span>
                        {server.storedRoles.includes(role)
                          ? <span className="text-xs text-emerald-700">Stored on server (encrypted)</span>
                          : <span className="text-xs text-amber-700">Password needed</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {project.authType !== 'BASIC' && project.authType !== 'TOKEN' && (
                  <Button size="sm" icon={Lock} onClick={() => openLogins(true)}>{formLogins.length || server.storedRoles.length ? 'Update test login' : 'Add a test login'}</Button>
                )}
              </div>
            </Card>
          )}
          {project.demo && (
            <Notice kind="warn" className="text-xs" title="Demo project">Starting runs a <strong>simulation</strong> with sample results, so you can preview the Live Testing screen.</Notice>
          )}
        </aside>
      </div>

    </>
  );
}

