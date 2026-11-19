import { Link } from 'react-router';
import { Activity as ActivityIcon, Bug, CheckCircle2, FolderKanban, History, PlayCircle, Plus, Settings2, SlidersHorizontal, XCircle } from 'lucide-react';
import { DemoTag, cx } from '../../components/ui';
import { formatDate, relativeTime } from '../../lib/format';
import type { Activity } from '../../lib/types';

const KIND: Record<Activity['kind'], { icon: typeof Bug; node: string; chip: string; label: string }> = {
  RUN_COMPLETED: { icon: CheckCircle2, node: 'bg-emerald-500 text-white', chip: 'bg-emerald-50 text-emerald-700', label: 'Run completed' },
  RUN_STARTED: { icon: PlayCircle, node: 'bg-brand-600 text-ivory', chip: 'bg-brand-50 text-brand-700', label: 'Run started' },
  RUN_STOPPED: { icon: XCircle, node: 'bg-slate-400 text-white', chip: 'bg-slate-100 text-slate-600', label: 'Run stopped' },
  ISSUE_FOUND: { icon: Bug, node: 'bg-rose-500 text-white', chip: 'bg-rose-50 text-rose-700', label: 'Issue found' },
  PROJECT_CREATED: { icon: FolderKanban, node: 'bg-sky-500 text-white', chip: 'bg-sky-50 text-sky-700', label: 'Project added' },
  CONFIG_SAVED: { icon: Settings2, node: 'bg-violet-500 text-white', chip: 'bg-violet-50 text-violet-700', label: 'Config saved' },
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function Timeline({ items }: { items: Activity[] }) {
  const list = items.slice(0, 7);
  return (
    <section className="app-surface flex flex-col overflow-hidden rounded-3xl lg:col-span-5">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10"><History className="size-4" /></span>
          <div>
            <h2 className="font-display text-[15px] font-bold tracking-tight text-slate-900">Recent activity</h2>
            <p className="text-xs text-slate-500">{list.length ? `Latest ${list.length} events` : 'Projects, configurations and runs'}</p>
          </div>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="relative flex-1 px-5 py-6">
          {/* Placeholder rail: clearly empty skeleton rows, not data */}
          <ol aria-hidden className="relative space-y-5 opacity-60">
            <span className="timeline-rail absolute bottom-2 left-[17px] top-2 w-px bg-gradient-to-b from-slate-200 to-transparent" />
            {[0, 1, 2].map((i) => (
              <li key={i} className="relative flex items-center gap-4">
                <span className="z-10 size-9 shrink-0 rounded-full border-2 border-dashed border-slate-300 bg-white" />
                <span className="flex-1 space-y-1.5">
                  <span className="skeleton block h-2.5 rounded-full" style={{ width: `${70 - i * 15}%` }} />
                  <span className="skeleton block h-2 w-1/4 rounded-full" />
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6 text-center">
            <p className="font-display text-[15px] font-bold tracking-tight text-slate-900">No activity yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">Adding websites, saving configurations and test runs will appear on this timeline.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link to="/projects/new" className="btn-motion inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-600 px-3 text-xs font-semibold text-ivory transition-all hover:-translate-y-px hover:bg-brand-500"><Plus className="size-3.5" />Add website</Link>
              <Link to="/configure" className="btn-motion inline-flex h-8 items-center gap-1.5 rounded-full bg-white/80 px-3 text-xs font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 transition-all hover:-translate-y-px"><SlidersHorizontal className="size-3.5" />Configure</Link>
            </div>
          </div>
        </div>
      ) : (
        <ol className="stagger relative flex-1 px-5 py-4" style={{ '--stagger-step': '80ms', '--stagger-delay': '150ms' } as React.CSSProperties}>
          {list.map((a, i) => {
            const k = KIND[a.kind];
            const showDay = i === 0 || dayLabel(a.at) !== dayLabel(list[i - 1]!.at);
            const body = (
              <>
                <span className="relative z-10 shrink-0">
                  <span className={cx('grid size-9 place-items-center rounded-full ring-4 ring-white transition-transform duration-300 ease-out group-hover:scale-110', k.node)}><k.icon className="size-4" /></span>
                  {i === 0 && <span className="node-ping absolute inset-0 rounded-full" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="block text-sm leading-snug text-slate-800 transition-colors group-hover:text-slate-950">{a.message}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className={cx('rounded-full px-1.5 py-px font-semibold', k.chip)}>{k.label}</span>
                    <time dateTime={a.at} title={formatDate(a.at)}>{relativeTime(a.at)}</time>
                    {a.demo && <DemoTag />}
                  </span>
                </span>
              </>
            );
            return (
              <li key={a.id} className="relative">
                {showDay && <p className="mb-1 ml-[52px] mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">{dayLabel(a.at)}</p>}
                {/* rail segment to the next node */}
                {i < list.length - 1 && <span aria-hidden className="timeline-rail absolute left-[17px] top-[22px] h-full w-px bg-slate-200" />}
                {a.link ? (
                  <Link to={a.link} className="group -mx-2 flex gap-4 rounded-2xl px-2 py-2 transition-colors duration-200 hover:bg-slate-50/80">{body}</Link>
                ) : (
                  <div className="group -mx-2 flex gap-4 px-2 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <footer className="flex items-center gap-1.5 border-t border-slate-200/70 bg-slate-50/60 px-5 py-2.5 text-[11px] text-slate-500">
        <ActivityIcon className="size-3.5" /> Activity is stored in this browser until the backend is connected.
      </footer>
    </section>
  );
}
