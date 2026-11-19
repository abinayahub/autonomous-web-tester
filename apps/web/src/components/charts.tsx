import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CountUp, useInView } from './motion';
import { cx } from './ui';

const GROW = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Lightweight HTML/CSS charts (no chart library).
 * Rules followed: single axis, thin bars with 4px rounded data-ends anchored to the
 * baseline, recessive hairline grid, hover tooltip per mark, text in neutral ink.
 */

function niceMax(v: number): number {
  if (v <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export interface BarDatum {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  tooltip: ReactNode;
  to?: string;
}

export function ColumnChart({ data, color = 'var(--color-viz-critical)', height = 200, unit }: { data: BarDatum[]; color?: string; height?: number; unit: string }) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [max, max / 2, 0];
  // Bars grow from the baseline, left to right, the first time the chart scrolls into view.
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref);
  return (
    <div ref={ref} className="flex gap-3">
      {/* y axis */}
      <div className="relative w-7 shrink-0 text-right text-[11px] tabular-nums text-slate-400" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>{t}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className={cx('absolute inset-x-0 border-t', t === 0 ? 'border-viz-axis' : 'border-dashed border-viz-grid')} style={{ top: `${(1 - t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => {
              const h = (d.value / max) * 100;
              const delay = `${i * 55}ms`;
              const bar = (
                <div className="group relative flex h-full flex-1 items-end justify-center px-[10%]">
                  {/* hit target = whole column */}
                  <div className="absolute inset-0 rounded-md transition-colors group-hover:bg-slate-100/70" />
                  <div className="relative w-full max-w-9 rounded-t-[4px] group-hover:opacity-85" style={{ height: shown ? `${Math.max(h, d.value > 0 ? 1.5 : 0)}%` : '0%', background: color, transition: `height 0.8s ${GROW} ${delay}, opacity 0.2s` }} />
                  <span className="absolute text-[11px] font-medium tabular-nums text-slate-600" style={{ bottom: `calc(${shown ? h : 0}% + 4px)`, opacity: shown ? 1 : 0, transition: `bottom 0.8s ${GROW} ${delay}, opacity 0.4s ease-out calc(${delay} + 0.35s)` }}>{d.value}</span>
                  <div role="tooltip" className="pointer-events-none invisible absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-56 -translate-x-1/2 translate-y-1 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-xl transition-[opacity,translate,visibility] duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                    {d.tooltip}
                  </div>
                </div>
              );
              return d.to ? (
                <Link key={d.key} to={d.to} className="flex h-full flex-1" aria-label={`${d.label}: ${d.value} ${unit}`}>{bar}</Link>
              ) : (
                <div key={d.key} className="flex h-full flex-1" aria-label={`${d.label}: ${d.value} ${unit}`}>{bar}</div>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex gap-[2px]">
          {data.map((d) => (
            <div key={d.key} className="min-w-0 flex-1 text-center">
              <p className="truncate text-[11px] font-medium text-slate-600">{d.label}</p>
              {d.sublabel && <p className="truncate text-[10px] text-slate-400">{d.sublabel}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface HBarRow {
  key: string;
  label: ReactNode;
  value: number;
  color: string;
  to?: string;
  icon?: ReactNode;
}

export function BarList({ rows, total, emptyLabel = 'No data' }: { rows: HBarRow[]; total?: number; emptyLabel?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const sum = total ?? rows.reduce((a, r) => a + r.value, 0);
  const ref = useRef<HTMLUListElement>(null);
  const shown = useInView(ref);
  if (sum === 0) return <p className="py-6 text-center text-sm text-slate-500">{emptyLabel}</p>;
  return (
    <ul ref={ref} className="space-y-2.5">
      {rows.map((r, i) => {
        const content = (
          <>
            <div className="flex w-32 shrink-0 items-center gap-2 text-sm text-slate-700">{r.icon}<span className="truncate">{r.label}</span></div>
            <div className="relative h-6 min-w-0 flex-1 rounded-[4px] bg-slate-50">
              <div className="h-full rounded-[4px]" style={{ width: shown ? `${(r.value / max) * 100}%` : '0%', background: r.color, minWidth: shown && r.value > 0 ? 4 : 0, transition: `width 0.9s ${GROW} ${i * 70}ms` }} />
            </div>
            <span className="w-16 shrink-0 text-right text-sm tabular-nums">
              <span className="font-semibold text-slate-900">{r.value}</span>
              <span className="ml-1 text-xs text-slate-400">{sum ? Math.round((r.value / sum) * 100) : 0}%</span>
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.to ? (
              <Link to={r.to} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-0.5 transition-colors duration-200 hover:bg-slate-50">{content}</Link>
            ) : (
              <div className="flex items-center gap-3">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Ring showing one proportion (e.g. pass rate). Value is always printed in the centre. */
export function RingGauge({ value, label, size = 120, color = 'var(--color-viz-good)' }: { value: number; label: string; size?: number; color?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref);
  return (
    <div ref={ref} className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#efede6" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${shown ? c * pct : 0} ${c}`} style={{ transition: `stroke-dasharray 1.1s ${GROW} 0.15s` }} />
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-semibold tracking-tight text-slate-900"><CountUp value={pct * 100} duration={1100} format={(n) => `${n.toFixed(1)}%`} /></p>
        <p className="text-[11px] text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export const SEVERITY_COLORS = {
  CRITICAL: 'var(--color-viz-critical)',
  HIGH: 'var(--color-viz-serious)',
  MEDIUM: 'var(--color-viz-warning)',
  LOW: 'var(--color-viz-blue)',
  INFO: '#a19e92',
} as const;
