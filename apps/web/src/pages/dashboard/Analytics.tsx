import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertOctagon, LineChart, ShieldCheck } from 'lucide-react';
import { SEVERITY_COLORS } from '../../components/charts';
import { EmptyState } from '../../components/feedback';
import { Tabs } from '../../components/forms';
import { CountUp, useInView } from '../../components/motion';
import { severityLabel } from '../../components/badges';
import { ButtonLink, DemoTag, cx } from '../../components/ui';
import type { AppData } from '../../lib/store';
import { SEVERITIES, type Run, type Severity } from '../../lib/types';

// ── Test activity line chart ────────────────────────────────────

type Series = 'failed' | 'passRate' | 'pages';
const SERIES: Record<Series, { label: string; color: string; fill: string; value: (r: Run) => number; fmt: (n: number) => string; max?: number }> = {
  failed: { label: 'Failed tests', color: 'var(--color-viz-critical)', fill: '201 111 74', value: (r) => r.testsFailed, fmt: (n) => `${Math.round(n)}` },
  passRate: { label: 'Pass rate', color: 'var(--color-viz-good)', fill: '106 135 92', value: (r) => (r.testsPassed + r.testsFailed ? (r.testsPassed / (r.testsPassed + r.testsFailed)) * 100 : 0), fmt: (n) => `${n.toFixed(1)}%`, max: 100 },
  pages: { label: 'Pages tested', color: 'var(--color-viz-blue)', fill: '93 129 114', value: (r) => r.pagesDiscovered, fmt: (n) => `${Math.round(n)}` },
};

function niceMax(v: number) {
  if (v <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Smooth curve through points (Catmull-Rom → cubic Bézier). */
function smoothPath(pts: Array<[number, number]>) {
  if (pts.length < 2) return pts.length ? `M${pts[0]![0]},${pts[0]![1]}` : '';
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function TrendChart({ data }: { data: AppData }) {
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series>('failed');
  const [hover, setHover] = useState<number>();
  const [box, width] = useWidth<HTMLDivElement>();
  const shown = useInView(box);
  const runs = useMemo(() => [...data.runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-12), [data.runs]);
  const S = SERIES[series];
  const H = 230;
  const pad = { l: 36, r: 14, t: 18, b: 34 };
  const values = runs.map(S.value);
  const max = S.max ?? niceMax(Math.max(...values, 0) * 1.1);
  const min = series === 'passRate' ? Math.max(0, Math.floor((Math.min(...values, 100) - 2) / 5) * 5) : 0;
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (runs.length <= 1 ? iw / 2 : (i / (runs.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - min) / (max - min || 1)) * ih;
  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
  const line = smoothPath(pts);
  const area = pts.length ? `${line} L${pts[pts.length - 1]![0]},${pad.t + ih} L${pts[0]![0]},${pad.t + ih} Z` : '';
  const ticks = [min, (min + max) / 2, max];
  const h = hover !== undefined ? runs[hover] : undefined;

  const onMove = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const rel = clientX - r.left - pad.l;
    const i = runs.length <= 1 ? 0 : Math.round((rel / iw) * (runs.length - 1));
    setHover(Math.max(0, Math.min(runs.length - 1, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setHover((i) => Math.min(runs.length - 1, (i ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((i) => Math.max(0, (i ?? runs.length) - 1));
    else if (e.key === 'Enter' && h) navigate(`/reports?project=${h.projectId}`);
    else if (e.key === 'Escape') setHover(undefined);
  };

  return (
    <section className="app-surface overflow-hidden rounded-3xl lg:col-span-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10"><LineChart className="size-4" /></span>
          <div>
            <h2 className="flex items-center gap-2 font-display text-[15px] font-bold tracking-tight text-slate-900">Test activity {data.demo && runs.length > 0 && <DemoTag />}</h2>
            <p className="text-xs text-slate-500">{runs.length ? `Last ${runs.length} runs · hover or use ← → for details` : 'Trends across test runs'}</p>
          </div>
        </div>
        {runs.length > 0 && (
          <Tabs value={series} onChange={(s) => { setSeries(s); setHover(undefined); }} items={(Object.keys(SERIES) as Series[]).map((k) => ({ value: k, label: SERIES[k].label }))} />
        )}
      </header>
      {runs.length === 0 ? (
        <div className="p-5">
          <div className="relative h-[230px] overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
            <div aria-hidden className="absolute inset-x-6 top-1/4 border-t border-dashed border-slate-200" />
            <div aria-hidden className="absolute inset-x-6 top-2/4 border-t border-dashed border-slate-200" />
            <div aria-hidden className="absolute inset-x-6 top-3/4 border-t border-slate-300" />
            <div className="absolute inset-0 grid place-items-center">
              <EmptyState compact icon={LineChart} title="No test runs yet" action={<ButtonLink to="/live" size="sm" variant="primary">Start testing</ButtonLink>}>
                Failures, pass rate and pages tested will be charted here run by run.
              </EmptyState>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 pt-3">
          <div
            ref={box}
            className="relative select-none outline-none"
            style={{ height: H }}
            tabIndex={0}
            role="img"
            aria-label={`${S.label} for the last ${runs.length} runs`}
            onPointerMove={(e) => onMove(e.clientX)}
            onPointerLeave={() => setHover(undefined)}
            onClick={() => h && navigate(`/reports?project=${h.projectId}`)}
            onKeyDown={onKey}
          >
            {width > 0 && (
              <svg width={width} height={H} className="absolute inset-0 overflow-visible" aria-hidden>
                <defs>
                  <linearGradient id={`area-${series}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor={`rgb(${S.fill} / 0.28)`} />
                    <stop offset="1" stopColor={`rgb(${S.fill} / 0)`} />
                  </linearGradient>
                </defs>
                {ticks.map((t, i) => (
                  <g key={i}>
                    <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={i === 0 ? 'var(--color-viz-axis)' : 'var(--color-viz-grid)'} strokeDasharray={i === 0 ? undefined : '3 4'} />
                    <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">{series === 'passRate' ? `${Math.round(t)}%` : Math.round(t)}</text>
                  </g>
                ))}
                {runs.map((r, i) => (
                  <text key={r.id} x={x(i)} y={H - 10} textAnchor="middle" className={cx('text-[10px] transition-colors', hover === i ? 'fill-slate-800 font-semibold' : 'fill-slate-400')}>
                    {new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </text>
                ))}
                {shown && (
                  <g key={series}>
                    <path d={area} fill={`url(#area-${series})`} className="chart-area" />
                    <path d={line} fill="none" stroke={S.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="chart-draw" />
                    {pts.map(([px, py], i) => (
                      <circle key={i} cx={px} cy={py} r={hover === i ? 6 : 3.5} fill="white" stroke={S.color} strokeWidth={2.5} className="chart-dot" style={{ animationDelay: `${0.5 + i * 0.07}s`, transition: 'r 0.2s ease-out' }} />
                    ))}
                  </g>
                )}
                {hover !== undefined && pts[hover] && (
                  <line x1={pts[hover][0]} x2={pts[hover][0]} y1={pad.t} y2={pad.t + ih} stroke="var(--color-slate-400)" strokeDasharray="3 3" className="anim-fade" />
                )}
              </svg>
            )}
            {h && pts[hover!] && (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-10 w-max max-w-60 rounded-xl bg-slate-900/95 px-3.5 py-2.5 text-xs text-white shadow-xl backdrop-blur transition-[left,top] duration-200 ease-out"
                style={{ left: Math.min(Math.max(pts[hover!]![0], 110), width - 110), top: Math.max(0, pts[hover!]![1] - 12), transform: 'translate(-50%, -100%)' }}
              >
                <p className="font-semibold">{data.project(h.projectId)?.name ?? 'Run'}</p>
                <p className="text-slate-300">{new Date(h.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                <p className="mt-1.5 text-sm font-bold" style={{ color: series === 'failed' ? '#e1a185' : '#c9d6bf' }}>{S.label}: {S.fmt(S.value(h))}</p>
                <p className="mt-0.5 text-slate-300">Passed {h.testsPassed} · Failed {h.testsFailed} · Flaky {h.testsFlaky}</p>
                <p className="text-slate-300">Pages {h.pagesDiscovered} · Issues {h.issuesFound}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Click to open report</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Issue severity donut ────────────────────────────────────────

export function SeverityPanel({ data }: { data: AppData }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref);
  const [active, setActive] = useState<Severity>();
  const open = data.issues.filter((i) => i.classification === 'CONFIRMED' && i.status === 'OPEN');
  const counts = SEVERITIES.map((s) => ({ s, n: open.filter((i) => i.severity === s).length }));
  const total = open.length;
  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = total > 1 ? 1.6 : 0;
  let acc = 0;
  const segs = counts.filter((x) => x.n > 0).map((x) => {
    const len = (x.n / total) * c;
    const seg = { ...x, len: Math.max(0, len - gap), off: acc };
    acc += len;
    return seg;
  });
  const focus = active ? counts.find((x) => x.s === active)! : undefined;

  return (
    <section className="app-surface flex flex-col overflow-hidden rounded-3xl lg:col-span-4">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-600/10"><AlertOctagon className="size-4" /></span>
          <div>
            <h2 className="font-display text-[15px] font-bold tracking-tight text-slate-900">Issue severity</h2>
            <p className="text-xs text-slate-500">Confirmed issues still open</p>
          </div>
        </div>
        {data.demo && total > 0 && <DemoTag />}
      </header>
      <div ref={ref} className="flex flex-1 flex-col items-center gap-5 p-5">
        <div className="relative size-[176px]">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-slate-100)" strokeWidth="11" />
            {segs.map((sg, i) => (
              <circle
                key={sg.s}
                cx="50" cy="50" r={r} fill="none"
                stroke={SEVERITY_COLORS[sg.s]}
                strokeWidth={active === sg.s ? 13 : 11}
                strokeDasharray={`${shown ? sg.len : 0} ${c}`}
                strokeDashoffset={-sg.off}
                className="cursor-pointer"
                style={{ opacity: active && active !== sg.s ? 0.25 : 1, transition: `stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1) ${0.25 + i * 0.18}s, opacity 0.25s, stroke-width 0.25s` }}
                onPointerEnter={() => setActive(sg.s)}
                onPointerLeave={() => setActive(undefined)}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            {total === 0 ? (
              <div><ShieldCheck className="mx-auto size-6 text-slate-300" /><p className="mt-1 text-xs font-medium text-slate-500">{data.runs.length ? 'No open issues' : 'No data yet'}</p></div>
            ) : (
              <div key={active ?? 'all'} className="anim-fade">
                <p className="font-display text-4xl font-bold tracking-tight text-slate-900">{focus ? focus.n : <CountUp value={total} />}</p>
                <p className="text-xs text-slate-500">{focus ? severityLabel(focus.s) : 'open issues'}</p>
              </div>
            )}
          </div>
        </div>
        <ul className="stagger w-full space-y-1">
          {counts.map(({ s, n }) => (
            <li key={s}>
              <Link
                to={`/issues?severity=${s}&status=OPEN`}
                onPointerEnter={() => n && setActive(s)}
                onPointerLeave={() => setActive(undefined)}
                onFocus={() => n && setActive(s)}
                onBlur={() => setActive(undefined)}
                className={cx('flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-all duration-200', active === s ? 'bg-slate-100/80 translate-x-0.5' : 'hover:bg-slate-50', active && active !== s && 'opacity-50')}
              >
                <span className="size-2.5 rounded-full transition-transform duration-200" style={{ background: SEVERITY_COLORS[s], transform: active === s ? 'scale(1.35)' : undefined }} />
                <span className="flex-1 text-slate-700">{severityLabel(s)}</span>
                <span className="font-semibold tabular-nums text-slate-900">{n}</span>
                <span className="w-10 text-right text-xs tabular-nums text-slate-400">{total ? Math.round((n / total) * 100) : 0}%</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
