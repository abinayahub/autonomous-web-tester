import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CheckCircle2, CircleDashed, Clock, Compass, FileStack, Loader2, Play, Radar, RotateCcw, SlidersHorizontal, Square, Timer, Activity, XCircle, AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import { EmptyState, Modal, Notice } from '../components/feedback';
import { Tabs } from '../components/forms';
import { CountUp } from '../components/motion';
import { Badge, Button, ButtonLink, Card, CardHeader, DemoTag, PageHeader, ProgressBar, SiteIcon, StatCard, cx } from '../components/ui';
import { moduleInfo } from '../lib/catalog';
import { useLiveRun, type LogLevel, type LiveRun } from '../lib/live';
import { useData, useStore } from '../lib/store';
import { RunPanel, ServerRunBadge } from '../components/RunPanel';
import { useApi } from '../lib/api';
import { isActive, type ServerRun } from '../lib/remote';

/** Real runs that are queued or running right now (from PostgreSQL). */
function ActiveServerRuns() {
  const res = useApi<{ items: ServerRun[] }>('/runs?limit=20', (d) => (d?.items.some(isActive) ? 3_000 : 10_000));
  const active = (res.data?.items ?? []).filter(isActive);
  if (!active.length) return null;
  return (
    <Card className="mb-6">
      <CardHeader title="Tests running now" description="Real test runs on the server" icon={Radar} />
      <ul className="divide-y divide-slate-100">
        {active.map((r) => (
          <li key={r.id}>
            <Link to={`/live?run=${r.id}`} className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-slate-50">
              <SiteIcon name={r.project.name} />
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-900">{r.project.name}</span><span className="block truncate text-xs text-slate-500">{r.project.baseUrl}</span></span>
              <ServerRunBadge s={r.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const LOG_STYLE: Record<LogLevel, { icon: LucideIcon; cls: string }> = {
  info: { icon: Info, cls: 'text-slate-300' },
  discover: { icon: Compass, cls: 'text-sky-300' },
  pass: { icon: CheckCircle2, cls: 'text-emerald-300' },
  fail: { icon: XCircle, cls: 'text-rose-300' },
  warn: { icon: AlertTriangle, cls: 'text-amber-300' },
};

function ActivityLog({ run }: { run: LiveRun }) {
  const [filter, setFilter] = useState<'all' | 'fail' | 'discover'>('all');
  const ref = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const entries = run.log.filter((l) => filter === 'all' || l.level === filter);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title="Activity log"
        icon={Activity}
        action={<Tabs value={filter} onChange={setFilter} items={[{ value: 'all', label: 'All' }, { value: 'fail', label: 'Failures', count: run.log.filter((l) => l.level === 'fail').length }, { value: 'discover', label: 'Discovery' }]} />}
      />
      <ol
        ref={ref}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
        className="h-[380px] space-y-0.5 overflow-y-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed xl:h-0 xl:min-h-[380px] xl:flex-1"
        aria-live="polite"
      >
        {entries.length === 0 && <li className="text-slate-500">No entries yet.</li>}
        {entries.map((l) => {
          const s = LOG_STYLE[l.level];
          return (
            <li key={l.id} className="anim-line flex gap-2.5">
              <time className="shrink-0 text-slate-500">{new Date(l.at).toLocaleTimeString([], { hour12: false })}</time>
              <s.icon className={cx('mt-0.5 size-3.5 shrink-0', s.cls)} />
              <span className={cx('min-w-0 break-words', s.cls)}>{l.message}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function NoRun() {
  const data = useData();
  const store = useStore();
  const live = useLiveRun();
  const demoProjects = data.projects.filter((p) => p.demo);
  return (
    <>
      <PageHeader title="Live testing" description="Follow a test run in real time: pages discovered, tests executed and every finding as it happens." />
      <Card>
        <EmptyState
          icon={Radar}
          title="No test is running"
          action={
            <>
              <ButtonLink to="/configure" variant="primary" icon={SlidersHorizontal}>Configure a test</ButtonLink>
              {!store.preferences.demoMode && <Button onClick={() => store.setPreferences({ demoMode: true })} icon={Play}>Preview with demo data</Button>}
            </>
          }
        >
          Start a real test from <strong>Test configuration</strong> — its progress appears here and on the project page. You can also run a clearly labelled <strong>demo simulation</strong>.
        </EmptyState>
        {store.preferences.demoMode && demoProjects.length > 0 && (
          <div className="border-t border-slate-100 p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><DemoTag /> Start a demo simulation</p>
            <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-3">
              {demoProjects.map((p) => (
                <button key={p.id} onClick={() => live.start(p, data.configFor(p.id))} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover">
                  <SiteIcon name={p.name} demo />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
                    <span className="block truncate text-xs text-slate-500">{p.url}</span>
                  </span>
                  <Play className="size-4 text-slate-400 transition-colors group-hover:text-brand-600" />
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

export function LiveTesting() {
  const [search] = useSearchParams();
  const realRunId = search.get('run') ?? undefined;
  const live = useLiveRun();
  const run = live.run;
  const active = run?.status === 'RUNNING' || run?.status === 'STOPPING';
  const now = useNow(!!active);
  const [confirmStop, setConfirmStop] = useState(false);

  if (realRunId) {
    return (
      <>
        <PageHeader title="Live testing" description="Progress of a real test run, as recorded by the testing engine." />
        <RunPanel key={realRunId} runId={realRunId} />
      </>
    );
  }
  if (!run) return <><ActiveServerRuns /><NoRun /></>;

  const done = run.passed + run.failed;
  const pct = run.testsPlanned ? Math.round((done / run.testsPlanned) * 100) : 0;
  const elapsed = (run.finishedAt ?? now) - run.startedAt;
  const eta = done > 3 && active ? (elapsed / done) * (run.testsPlanned - done) : undefined;
  const testsRunning = active ? Math.min(3, run.testsPlanned - done) : 0;
  const current = run.pages.find((p) => p.path === run.currentPath);
  const statusBadge = run.status === 'RUNNING' ? <Badge tone="brand" icon={Loader2} className="[&>svg]:animate-spin">Running</Badge>
    : run.status === 'STOPPING' ? <Badge tone="amber" icon={Loader2} className="[&>svg]:animate-spin">Stopping…</Badge>
    : run.status === 'STOPPED' ? <Badge tone="gray" icon={Square}>Stopped</Badge>
    : <Badge tone="green" icon={CheckCircle2}>Completed</Badge>;

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><DemoTag /> <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Demo simulation — sample results, not a real test</span></span>}
        title={<span className="flex flex-wrap items-center gap-3">{run.project.name} {statusBadge}</span>}
        description={run.project.url}
        actions={
          active ? (
            <Button variant="danger" icon={Square} onClick={() => setConfirmStop(true)} disabled={run.status === 'STOPPING'}>Stop testing</Button>
          ) : (
            <>
              <Button icon={RotateCcw} onClick={() => live.start(run.project, run.config)}>Run again</Button>
              <Button variant="ghost" onClick={live.clear}>Close</Button>
            </>
          )
        }
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Overall progress</p>
                <p className="mt-1 font-display text-4xl font-bold tracking-tight text-slate-900"><CountUp value={pct} format={(n) => `${Math.round(n)}%`} /></p>
              </div>
              <p className="text-right text-sm text-slate-500"><CountUp value={done} className="font-semibold text-slate-900" /> of {run.testsPlanned} tests</p>
            </div>
            <ProgressBar value={done} max={run.testsPlanned} className="mt-4" active={active} />
          </div>
          <dl className="grid grid-cols-3 gap-6 border-slate-100 text-sm lg:border-l lg:pl-6">
            <div><dt className="flex items-center gap-1.5 text-slate-500"><Timer className="size-3.5" />Elapsed</dt><dd className="mt-1 font-mono text-lg font-semibold text-slate-900">{clock(elapsed)}</dd></div>
            <div><dt className="flex items-center gap-1.5 text-slate-500"><Clock className="size-3.5" />Remaining</dt><dd className="mt-1 font-mono text-lg font-semibold text-slate-900">{eta !== undefined ? `~${clock(eta)}` : '—'}</dd></div>
            <div><dt className="flex items-center gap-1.5 text-slate-500"><FileStack className="size-3.5" />Pages</dt><dd className="mt-1 font-mono text-lg font-semibold text-slate-900">{run.pages.filter((p) => p.state === 'done').length}/{run.pages.length}</dd></div>
          </dl>
        </div>
        <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-6 py-3.5 text-sm', active ? 'border-brand-100 bg-brand-50/50' : 'border-slate-100 bg-slate-50/60')}>
          <span className="font-medium text-slate-500">Current page</span>
          {active && run.currentPath ? (
            <>
              <code key={run.currentPath} className="anim-fade rounded-md bg-white px-2 py-0.5 font-mono text-[13px] text-slate-900 ring-1 ring-slate-200">{run.project.url}{run.currentPath}</code>
              {run.currentModule && (
                <span className="flex items-center gap-1.5 text-brand-700"><Loader2 className="size-3.5 animate-spin" /> {moduleInfo(run.currentModule).name}</span>
              )}
              {current && current.failures > 0 && <Badge tone="red" icon={XCircle}>{current.failures} failed on this page</Badge>}
            </>
          ) : (
            <span className="text-slate-500">{run.status === 'COMPLETED' ? 'All pages tested' : 'Not testing'}</span>
          )}
        </div>
      </Card>

      <div className="stagger mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard demo label="Pages discovered" value={run.pages.length} icon={Compass} iconCls="bg-sky-50 text-sky-600" hint={`of ${run.totalPages} reachable`} />
        <StatCard demo label="Tests running" value={testsRunning} icon={Loader2} iconCls="bg-brand-50 text-brand-600" hint={active ? 'In parallel browsers' : 'Idle'} />
        <StatCard demo label="Tests passed" value={run.passed} icon={CheckCircle2} iconCls="bg-emerald-50 text-emerald-600" hint={done ? `${Math.round((run.passed / done) * 100)}% pass rate` : '—'} />
        <StatCard demo label="Tests failed" value={run.failed} icon={XCircle} iconCls="bg-rose-50 text-rose-600" hint={run.failed ? 'Will be retried to rule out flakiness' : 'None so far'} />
      </div>

      {run.status === 'COMPLETED' && (
        <Notice kind="success" className="mt-6" title="Demo simulation complete">
          In a real run, confirmed failures become issues with screenshots. <Link to="/issues" className="font-semibold underline">Browse demo issues</Link> to see how they're reported.
        </Notice>
      )}
      {run.status === 'STOPPED' && <Notice kind="warn" className="mt-6" title="Testing stopped">The simulation was stopped before all pages were tested.</Notice>}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <ActivityLog run={run} />
        <div className="space-y-6">
          <Card>
            <CardHeader title="Modules" description={`${run.config.modules.length} selected`} />
            <ul className="stagger space-y-3 p-5">
              {run.config.modules.map((m) => {
                const info = moduleInfo(m);
                const d = run.moduleDone[m] ?? { passed: 0, failed: 0 };
                const isCurrent = active && run.currentModule === m;
                return (
                  <li key={m}>
                    <div className="mb-1.5 flex items-center gap-2 text-sm">
                      <info.icon className={cx('size-4 transition-colors duration-300', isCurrent ? 'text-brand-600' : 'text-slate-400')} />
                      <span className={cx('flex-1 truncate transition-colors duration-300', isCurrent ? 'font-semibold text-slate-900' : 'text-slate-700')}>{info.name}</span>
                      <span className="text-xs tabular-nums text-slate-500"><span className="text-emerald-700">{d.passed}✓</span>{d.failed > 0 && <span className="ml-1.5 text-rose-600">{d.failed}✕</span>}</span>
                    </div>
                    <ProgressBar size="sm" value={d.passed + d.failed} max={run.totalPages} active={isCurrent} />
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Discovered pages" description={`${run.pages.length} found`} />
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {run.pages.map((p) => (
                <li key={p.path} className={cx('anim-line flex items-center gap-3 px-5 py-2.5 text-sm transition-colors duration-500', p.state === 'testing' && 'bg-brand-50/60')}>
                  {p.state === 'done' ? (p.failures ? <XCircle className="size-4 text-rose-500" /> : <CheckCircle2 className="size-4 text-emerald-500" />) : p.state === 'testing' ? <Loader2 className="size-4 animate-spin text-brand-600" /> : <CircleDashed className="size-4 text-slate-300" />}
                  <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-700">{p.path}</code>
                  <span className="text-xs text-slate-400">{p.state === 'done' ? (p.failures ? `${p.failures} failed` : 'passed') : p.state === 'testing' ? 'testing' : 'queued'}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        size="sm"
        title="Stop testing?"
        description="The current test finishes, then the browser closes. Results gathered so far are kept."
        footer={
          <>
            <Button onClick={() => setConfirmStop(false)}>Keep testing</Button>
            <Button variant="danger" icon={Square} onClick={() => { live.stop(); setConfirmStop(false); }}>Stop testing</Button>
          </>
        }
      />
    </>
  );
}
