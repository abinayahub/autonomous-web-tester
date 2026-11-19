import { Link } from 'react-router';
import { ArrowRight, Bug, CheckCircle2, FolderKanban, Globe, Play, Plus, SlidersHorizontal, XCircle } from 'lucide-react';
import { CountUp, useInView } from '../../components/motion';
import { DemoTag, SiteIcon, cx } from '../../components/ui';
import { relativeTime } from '../../lib/format';
import type { LiveRun } from '../../lib/live';
import { projectStats, type AppData } from '../../lib/store';
import { useRef, type CSSProperties } from 'react';
import { Radar, RiseWords, greeting, useTilt } from './kit';

export interface Totals {
  projects: number;
  realProjects: number;
  websitesTested: number;
  pagesDiscovered: number;
  passed: number;
  failed: number;
  flaky: number;
  confirmed: number;
  openConfirmed: number;
  unconfirmed: number;
  lastRunAt?: string;
}

export function computeTotals(data: AppData): Totals {
  const latest = data.projects.map((p) => projectStats(p, data).latest).filter((r) => r !== undefined);
  const confirmed = data.issues.filter((i) => i.classification === 'CONFIRMED');
  const sorted = [...data.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return {
    projects: data.projects.length,
    realProjects: data.projects.filter((p) => !p.demo).length,
    websitesTested: latest.length,
    pagesDiscovered: latest.reduce((a, r) => a + r.pagesDiscovered, 0),
    passed: data.runs.reduce((a, r) => a + r.testsPassed, 0),
    failed: data.runs.reduce((a, r) => a + r.testsFailed, 0),
    flaky: data.runs.reduce((a, r) => a + r.testsFlaky, 0),
    confirmed: confirmed.length,
    openConfirmed: confirmed.filter((i) => i.status === 'OPEN').length,
    unconfirmed: data.issues.length - confirmed.length,
    lastRunAt: sorted[0]?.finishedAt ?? sorted[0]?.startedAt,
  };
}

// ── Welcome / control center ────────────────────────────────────

export function ControlCenter({ name, t, live, demo }: { name: string; t: Totals; live?: LiveRun; demo: boolean }) {
  const running = live && (live.status === 'RUNNING' || live.status === 'STOPPING');
  const panel = useTilt<HTMLDivElement>(2.5);
  const passRate = t.passed + t.failed > 0 ? t.passed / (t.passed + t.failed) : undefined;
  const summary = t.projects === 0
    ? 'Add the first website you’re authorized to test — the control center comes alive as results arrive.'
    : `${t.projects} project${t.projects === 1 ? '' : 's'} · ${t.openConfirmed} open confirmed issue${t.openConfirmed === 1 ? '' : 's'} · ${t.lastRunAt ? `last run ${relativeTime(t.lastRunAt)}` : 'no test runs yet'}`;

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] bg-forest px-6 py-7 text-ivory shadow-[0_30px_60px_-32px_rgba(32,55,45,0.75)] sm:px-8 sm:py-9 lg:px-10">
      {/* Atmosphere: the same sage / terracotta glows and dot grid as the sidebar, plus a slow light sweep */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-32 -z-10 size-[420px] rounded-full bg-sage/25 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 right-10 -z-10 size-[380px] rounded-full bg-terra/20 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgba(245,243,237,0.07)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div aria-hidden className="hero-sweep pointer-events-none absolute inset-y-0 -z-10 w-1/3" />

      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <p className="anim-fade inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.07] py-1.5 pl-3 pr-3.5 text-xs font-medium text-ivory/80 backdrop-blur">
            <Radar className={running ? 'text-terra' : 'text-sage'} idle={!running} />
            {running ? (
              <span className="truncate">Scanning <span className="font-mono text-ivory">{live.project.url.replace(/^https?:\/\//, '')}{live.currentPath ?? ''}</span></span>
            ) : (
              <span className="truncate">Control center ready <span className="text-ivory/45">· test engine not connected yet</span></span>
            )}
            {running && <DemoTag className="ml-0.5" />}
          </p>

          <h1 className="mt-5 font-display text-[34px] font-bold leading-[1.05] tracking-[-0.04em] sm:text-[44px]">
            <RiseWords text={`${greeting()}${name ? `, ${name}` : ''}.`} />
            <br />
            <RiseWords text="Every page, verified." offset={3} className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-sage" />
          </h1>
          <p className="anim-rise mt-4 max-w-xl text-sm leading-relaxed text-ivory/65 sm:text-[15px]" style={{ '--delay': '450ms' } as CSSProperties}>{summary}</p>

          <div className="anim-rise mt-7 flex flex-wrap items-center gap-3" style={{ '--delay': '560ms' } as CSSProperties}>
            <Link to="/projects/new" className="btn-motion group inline-flex h-11 items-center gap-2 rounded-full bg-ivory px-5 text-sm font-semibold text-forest shadow-[0_12px_28px_-14px_rgba(0,0,0,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white active:scale-[0.97]">
              <Plus className="size-4" /> Add website
            </Link>
            <Link to="/live" className="btn-motion group inline-flex h-11 items-center gap-2 rounded-full bg-white/[0.07] px-5 text-sm font-semibold text-ivory ring-1 ring-inset ring-white/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.12] hover:ring-white/35 active:scale-[0.97]">
              <span className="grid size-5 place-items-center rounded-full bg-terra text-white transition-transform duration-300 group-hover:scale-110"><Play className="size-2.5 fill-current" /></span>
              {running ? 'View live run' : 'Start testing'}
            </Link>
            <Link to="/configure" className="btn-motion inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ivory/65 transition-colors hover:text-ivory">
              <SlidersHorizontal className="size-4" /> Configure
            </Link>
          </div>
        </div>

        {/* Compact testing overview */}
        <div ref={panel} className="tilt tilt-glow anim-rise glass-dark rounded-3xl p-5" style={{ '--delay': '300ms' } as CSSProperties}>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ivory/55">Testing overview</p>
            {demo && passRate !== undefined && <DemoTag />}
          </div>
          <div className="mt-4 flex items-center gap-5">
            <PassRing value={passRate} />
            <dl className="min-w-0 flex-1 space-y-3 text-sm">
              <OverviewRow label="Projects" value={t.projects} />
              <OverviewRow label="Websites tested" value={t.websitesTested} of={t.projects} />
              <OverviewRow label="Open issues" value={t.openConfirmed} accent />
            </dl>
          </div>
          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-ivory/50">
            {t.lastRunAt ? <>Last run finished <span className="text-ivory/80">{relativeTime(t.lastRunAt)}</span></> : 'No test runs yet — results appear here once testing starts.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function OverviewRow({ label, value, of, accent }: { label: string; value: number; of?: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-ivory/60">{label}</dt>
      <dd className={cx('font-display text-lg font-bold tabular-nums', accent && value > 0 ? 'text-terra' : 'text-ivory')}>
        <CountUp value={value} />
        {of !== undefined && <span className="text-sm font-medium text-ivory/40">/{of}</span>}
      </dd>
    </div>
  );
}

function PassRing({ value }: { value?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref);
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div ref={ref} className="relative grid size-[104px] shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(245,243,237,0.12)" strokeWidth="8" />
        {value !== undefined && (
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-sage)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${shown ? c * value : 0} ${c}`} style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.22,1,0.36,1) 0.4s' }} />
        )}
      </svg>
      <div className="text-center">
        <p className="font-display text-xl font-bold tracking-tight">{value === undefined ? '—' : <CountUp value={value * 100} duration={1400} format={(n) => `${n.toFixed(1)}%`} />}</p>
        <p className="text-[10px] uppercase tracking-wider text-ivory/50">pass rate</p>
      </div>
    </div>
  );
}

// ── Testing overview: asymmetric layout ─────────────────────────

export function Overview({ data, t, demo }: { data: AppData; t: Totals; demo: boolean }) {
  const projTilt = useTilt<HTMLAnchorElement>();
  const webTilt = useTilt<HTMLAnchorElement>();
  const stats = data.projects.map((p) => projectStats(p, data).status);
  const passing = stats.filter((s) => s === 'PASSED').length;
  const withIssues = stats.filter((s) => s === 'ISSUES_FOUND' || s === 'FAILED').length;
  const untested = stats.filter((s) => s === 'NOT_TESTED').length;
  const coverage = t.projects ? t.websitesTested / t.projects : 0;
  const coverRef = useRef<SVGSVGElement>(null);
  const coverShown = useInView(coverRef);

  return (
    <div className="stagger mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
      {/* Prominent: total projects */}
      <Link ref={projTilt} to="/projects" className="tilt tilt-glow app-surface group relative overflow-hidden rounded-3xl p-6 lg:col-span-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5 text-sm font-medium text-slate-500">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-ivory transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"><FolderKanban className="size-[18px]" /></span>
            Total projects
          </span>
          <ArrowRight className="size-4 text-slate-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-brand-600" />
        </div>
        <p className="mt-5 font-display text-[64px] font-bold leading-none tracking-[-0.05em] text-slate-900"><CountUp value={t.projects} /></p>
        <p className="mt-2 text-sm text-slate-500">
          {t.projects === 0 ? 'No projects yet — add a website to begin' : demo ? `${t.realProjects} yours · ${t.projects - t.realProjects} demo` : 'Saved in this browser'}
        </p>
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
          <div className="flex -space-x-2">
            {data.projects.slice(0, 5).map((p, i) => (
              <span key={p.id} className="anim-pop rounded-xl ring-2 ring-white" style={{ '--delay': `${500 + i * 90}ms` } as CSSProperties}><SiteIcon name={p.name} demo={p.demo} /></span>
            ))}
            {data.projects.length === 0 && <span className="grid size-10 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400"><Plus className="size-4" /></span>}
            {data.projects.length > 5 && <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 ring-2 ring-white">+{data.projects.length - 5}</span>}
          </div>
          {t.projects > 0 && (
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {passing > 0 && <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />{passing} passing</span>}
              {withIssues > 0 && <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-orange-400" />{withIssues} with issues</span>}
              {untested > 0 && <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-slate-300" />{untested} untested</span>}
            </div>
          )}
        </div>
      </Link>

      {/* Prominent: websites tested with coverage arc */}
      <Link ref={webTilt} to="/reports" className="tilt tilt-glow app-surface group relative overflow-hidden rounded-3xl p-6 lg:col-span-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5 text-sm font-medium text-slate-500">
            <span className="grid size-9 place-items-center rounded-xl bg-sky-50 text-sky-600 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"><Globe className="size-[18px]" /></span>
            Websites tested
          </span>
          {demo && t.websitesTested > 0 && <DemoTag />}
        </div>
        <div className="relative mx-auto mt-4 w-full max-w-[220px]">
          <svg ref={coverRef} viewBox="0 0 200 110" className="w-full" aria-hidden>
            <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke="var(--color-slate-100)" strokeWidth="14" strokeLinecap="round" />
            <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke="url(#cov)" strokeWidth="14" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" style={{ strokeDashoffset: coverShown ? 1 - coverage : 1, transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1) 0.35s', opacity: coverage > 0 ? 1 : 0 }} />
            <defs>
              <linearGradient id="cov" x1="0" x2="1"><stop offset="0" stopColor="var(--color-brand-400)" /><stop offset="1" stopColor="var(--color-brand-600)" /></linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <p className="font-display text-[44px] font-bold leading-none tracking-[-0.04em] text-slate-900"><CountUp value={t.websitesTested} /><span className="text-xl font-semibold text-slate-400">/{t.projects}</span></p>
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-slate-500">
          {t.websitesTested ? <><CountUp value={t.pagesDiscovered} className="font-semibold text-slate-800" /> pages discovered</> : 'No completed runs yet'}
        </p>
      </Link>

      {/* Connected statistics: passed → failed → issues */}
      <ConnectedStats t={t} demo={demo} />
    </div>
  );
}

function ConnectedStats({ t, demo }: { t: Totals; demo: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref);
  const total = t.passed + t.failed + t.flaky;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const nodes = [
    { label: 'Passed', value: t.passed, icon: CheckCircle2, cls: 'bg-emerald-500 text-white', ring: 'ring-emerald-100', hint: total ? `${pct(t.passed).toFixed(1)}% of tests` : 'No completed runs', to: '/reports' },
    { label: 'Failed', value: t.failed, icon: XCircle, cls: 'bg-rose-500 text-white', ring: 'ring-rose-100', hint: t.flaky ? `${t.flaky} flaky counted apart` : total ? 'Retried before reporting' : 'No completed runs', to: '/reports' },
    { label: 'Issues detected', value: t.confirmed, icon: Bug, cls: 'bg-amber-500 text-white', ring: 'ring-amber-100', hint: t.confirmed || t.unconfirmed ? `${t.openConfirmed} open · ${t.unconfirmed} unconfirmed` : 'No issues yet', to: '/issues' },
  ];
  return (
    <div ref={ref} className="app-surface relative overflow-hidden rounded-3xl p-6 md:col-span-2 lg:col-span-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">Test results</p>
        {demo && total > 0 && <DemoTag />}
      </div>
      <div className="relative mt-6 grid grid-cols-3">
        {/* connector line that draws from left to right */}
        <div aria-hidden className="absolute left-[16.6%] right-[16.6%] top-5 h-0.5 rounded-full bg-slate-200/80">
          <div className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-rose-400 to-amber-400" style={{ transform: `scaleX(${shown ? 1 : 0})`, transition: 'transform 1.2s cubic-bezier(0.22,1,0.36,1) 0.3s' }} />
        </div>
        {nodes.map((n, i) => (
          <Link key={n.label} to={n.to} className="group relative flex flex-col items-center text-center">
            <span className={cx('relative grid size-10 place-items-center rounded-full ring-4 transition-transform duration-300 ease-out group-hover:scale-110', n.cls, n.ring)} style={{ opacity: shown ? 1 : 0, transform: shown ? undefined : 'scale(0.6)', transition: `opacity 0.4s ease-out ${0.3 + i * 0.35}s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) ${0.3 + i * 0.35}s` }}>
              <n.icon className="size-[18px]" />
            </span>
            <span className="mt-3 font-display text-[28px] font-bold leading-none tracking-tight text-slate-900"><CountUp value={n.value} /></span>
            <span className="mt-1 text-xs font-semibold text-slate-700 transition-colors group-hover:text-brand-600">{n.label}</span>
            <span className="mt-0.5 hidden text-[11px] text-slate-500 sm:block">{n.hint}</span>
          </Link>
        ))}
      </div>
      <div className="mt-6">
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={total ? `${t.passed} passed, ${t.failed} failed, ${t.flaky} flaky` : 'No results yet'}>
          {[['bg-emerald-500', t.passed], ['bg-rose-500', t.failed], ['bg-amber-400', t.flaky]].map(([c, v], i) => (
            <div key={i} className={c as string} style={{ width: shown ? `${pct(v as number)}%` : '0%', transition: `width 1.1s cubic-bezier(0.22,1,0.36,1) ${0.5 + i * 0.15}s` }} />
          ))}
        </div>
        <p className="mt-2 flex justify-between text-[11px] text-slate-400">
          <span>{total ? `${total.toLocaleString()} tests across all runs` : 'Results appear after the first run'}</span>
          {total > 0 && <span>{t.flaky} flaky</span>}
        </p>
      </div>
    </div>
  );
}
