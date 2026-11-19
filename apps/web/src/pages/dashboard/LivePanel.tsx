import { Link } from 'react-router';
import { ArrowRight, Check, Lock, Minus, Radar as RadarIcon } from 'lucide-react';
import { DemoTag, cx } from '../../components/ui';
import { formatDate, relativeTime } from '../../lib/format';
import type { LiveRun } from '../../lib/live';
import type { AppData } from '../../lib/store';
import { Radar, idleStages, stagesFromLive, stagesFromRun, type StageKey, type StageStatus } from './kit';

type Mode = 'live' | 'last' | 'idle';

/**
 * Testing activity panel. Shows the real state only:
 *  - live: the running (demo-simulation) run, stage progress straight from its counters
 *  - last: the most recent completed run's summary
 *  - idle: nothing has run — the preview stays in standby and every stage says "waiting".
 */
export function LivePanel({ data, live }: { data: AppData; live?: LiveRun }) {
  const running = !!live && (live.status === 'RUNNING' || live.status === 'STOPPING');
  const lastRun = [...data.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const mode: Mode = live ? 'live' : lastRun ? 'last' : 'idle';
  const stages = live ? stagesFromLive(live) : lastRun ? stagesFromRun(lastRun) : idleStages();
  const activeStage = running ? stages.find((s) => s.state === 'active' && s.stage.key !== 'discover' && s.stage.key !== 'issues')?.stage.key ?? 'discover' : undefined;
  const project = live?.project ?? (lastRun ? data.project(lastRun.projectId) : undefined);
  const url = project ? `${project.url.replace(/^https?:\/\//, '')}${live?.currentPath ?? ''}` : undefined;
  const currentFailures = live?.pages.find((p) => p.path === live.currentPath)?.failures ?? 0;
  const done = live ? live.passed + live.failed : 0;
  const isDemo = live ? true : !!lastRun?.demo;

  return (
    <section className="app-surface flex flex-col overflow-hidden rounded-3xl lg:col-span-7">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10"><RadarIcon className="size-4" /></span>
          <div>
            <h2 className="font-display text-[15px] font-bold tracking-tight text-slate-900">Testing activity</h2>
            <p className="text-xs text-slate-500">
              {mode === 'live' ? (running ? `Run in progress · ${done} of ${live!.testsPlanned} tests` : `Run ${live!.status.toLowerCase()} · ${done} tests`) : mode === 'last' ? `Last run · ${relativeTime(lastRun!.finishedAt ?? lastRun!.startedAt)}` : 'No test is running'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && mode !== 'idle' && <DemoTag />}
          <span className={cx('inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', running ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : mode === 'idle' ? 'bg-slate-100 text-slate-600 ring-slate-500/15' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20')}>
            <Radar className={running ? 'text-rose-500' : mode === 'idle' ? 'text-slate-400' : 'text-emerald-500'} idle={!running} />
            {running ? 'Live' : mode === 'idle' ? 'Standby' : 'Completed'}
          </span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-5 p-5 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <SitePreview url={url} mode={mode} running={running} focus={activeStage} failures={currentFailures} />
        <ol className="stagger flex flex-col justify-center gap-2" aria-label="Testing stages">
          {stages.map((s, i) => <StageRow key={s.stage.key} s={s} index={i} />)}
        </ol>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 bg-slate-50/60 px-5 py-3 text-xs text-slate-500">
        <span className="truncate">
          {mode === 'live' ? <>Demo simulation on <strong className="font-semibold text-slate-700">{live!.project.name}</strong> — sample results, not a real test</>
            : mode === 'last' ? <>{project?.name ?? 'Project'} · finished {formatDate(lastRun!.finishedAt ?? lastRun!.startedAt)}</>
            : 'Real runs start once the test engine is connected.'}
        </span>
        <Link to={mode === 'last' ? `/reports?project=${lastRun!.projectId}` : '/live'} className="btn-motion inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-500">
          {mode === 'live' ? 'Open live view' : mode === 'last' ? 'View report' : 'Start testing'} <ArrowRight className="size-3.5" />
        </Link>
      </footer>
    </section>
  );
}

function StageRow({ s, index }: { s: StageStatus; index: number }) {
  const Icon = s.stage.icon;
  const tone = s.state === 'active' ? 'bg-brand-600 text-ivory shadow-[0_6px_16px_-8px_rgba(32,55,45,0.8)]' : s.state === 'done' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15' : 'bg-slate-100 text-slate-400';
  return (
    <li className={cx('relative rounded-2xl px-3 py-2.5 transition-colors duration-500', s.state === 'active' && 'bg-brand-50/70')}>
      <div className="flex items-center gap-3">
        <span className={cx('relative grid size-8 shrink-0 place-items-center rounded-xl transition-all duration-500', tone)}>
          {s.state === 'done' ? <Check className="size-4" /> : s.state === 'skipped' ? <Minus className="size-4" /> : <Icon className="size-4" />}
          {s.state === 'active' && <span className="stage-ping absolute inset-0 rounded-xl" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cx('truncate text-sm font-semibold transition-colors', s.state === 'waiting' || s.state === 'skipped' ? 'text-slate-500' : 'text-slate-900')}>
              <span className="mr-1.5 font-mono text-[10px] text-slate-400">0{index + 1}</span>{s.stage.label}
            </p>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{s.state === 'skipped' ? '—' : `${Math.round(s.progress * 100)}%`}</span>
          </div>
          <p className="truncate text-[11px] text-slate-500">{s.detail}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200/70">
            <div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', s.state === 'done' ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-600 to-brand-400', s.state === 'active' && 'progress-active')} style={{ width: `${s.progress * 100}%` }} />
          </div>
        </div>
      </div>
    </li>
  );
}

/** Wireframe of a web page with a scanning line. Purely illustrative — it shows where testing focuses, not results. */
function SitePreview({ url, mode, running, focus, failures }: { url?: string; mode: Mode; running: boolean; focus?: StageKey; failures: number }) {
  const hl = (k: StageKey) => cx('transition-all duration-500', running && focus === k ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-white bg-brand-100/80' : '');
  return (
    <div className="relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_40px_-28px_rgba(32,55,45,0.45)]">
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-slate-200/70 bg-slate-50 px-3 py-2">
        <span className="flex gap-1"><i className="size-2 rounded-full bg-rose-300" /><i className="size-2 rounded-full bg-amber-300" /><i className="size-2 rounded-full bg-emerald-300" /></span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-white px-2 py-1 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200">
          <Lock className="size-2.5 shrink-0 text-slate-400" />
          <span key={url} className="anim-fade truncate">{url ?? 'no website selected'}</span>
        </span>
      </div>
      {/* page wireframe */}
      <div className={cx('relative flex flex-1 flex-col justify-between gap-2.5 p-3 transition-opacity duration-500', mode === 'idle' && 'opacity-70')} aria-hidden>
        <div className={cx('flex items-center gap-2 rounded-md p-1', hl('navigation'))}>
          <span className="h-2.5 w-10 rounded bg-slate-800/80" />
          <span className="ml-auto h-1.5 w-7 rounded bg-slate-200" /><span className="h-1.5 w-7 rounded bg-slate-200" /><span className="h-1.5 w-7 rounded bg-slate-200" />
        </div>
        <div className={cx('rounded-lg bg-gradient-to-br from-brand-50 to-slate-50 p-3', hl('discover'))}>
          <span className="block h-2.5 w-3/4 rounded bg-slate-300/80" />
          <span className="mt-1.5 block h-2 w-1/2 rounded bg-slate-200" />
          <span className="mt-3 inline-block h-4 w-14 rounded-full bg-brand-600/80" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cx('relative rounded-md border border-slate-100 p-1.5', hl('navigation'))}>
              <span className="block aspect-[4/3] max-h-24 w-full rounded bg-slate-100" />
              <span className="mt-1 block h-1.5 w-3/4 rounded bg-slate-200" />
              {running && failures > 0 && i === 1 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white anim-pop" title="A check failed on this page">!</span>}
            </div>
          ))}
        </div>
        <div className={cx('space-y-1.5 rounded-md p-1', hl('forms'))}>
          <span className="block h-4 rounded border border-slate-200 bg-slate-50" />
          <span className="block h-4 rounded border border-slate-200 bg-slate-50" />
          <span className="block h-4 w-16 rounded bg-slate-700/80" />
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <span className="h-1.5 w-16 rounded bg-slate-200" />
          <span className="flex gap-1.5"><span className="h-1.5 w-6 rounded bg-slate-200" /><span className="h-1.5 w-6 rounded bg-slate-200" /></span>
        </div>
      </div>
      {/* the scanning line */}
      <div className={cx('scan-line', !running && 'scan-idle')} aria-hidden />
      {mode === 'idle' && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur">Standby — waiting for a test run</span>
        </div>
      )}
    </div>
  );
}
