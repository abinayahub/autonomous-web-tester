import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Loader2, type LucideIcon } from 'lucide-react';
import { CountUp } from './motion';

export function cx(...c: Array<string | false | null | undefined | 0>) {
  return c.filter(Boolean).join(' ');
}

// ── Buttons ─────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const variantCls: Record<Variant, string> = {
  primary: 'bg-brand-600 text-ivory shadow-[0_8px_18px_-10px_rgba(32,55,45,0.7)] hover:-translate-y-px hover:bg-brand-500 hover:shadow-[0_12px_22px_-12px_rgba(32,55,45,0.75)] active:bg-brand-700 disabled:translate-y-0 disabled:bg-brand-300 disabled:shadow-none',
  secondary: 'bg-white/80 text-slate-800 ring-1 ring-inset ring-slate-300/90 hover:-translate-y-px hover:bg-white hover:ring-slate-400 disabled:translate-y-0 disabled:text-slate-400 disabled:ring-slate-200',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-60',
  danger: 'bg-rose-600 text-white shadow-[0_8px_18px_-10px_rgba(180,93,58,0.7)] hover:-translate-y-px hover:bg-rose-500 disabled:translate-y-0 disabled:bg-rose-300',
};
const sizeCls: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-9.5 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
};
const btnBase = 'btn-motion inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all duration-200 ease-out active:scale-[0.97] active:duration-75 disabled:cursor-not-allowed disabled:active:scale-100';

export function buttonCls(variant: Variant = 'secondary', size: Size = 'md', className?: string) {
  return cx(btnBase, variantCls[variant], sizeCls[size], className);
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: LucideIcon; loading?: boolean }) {
  return (
    <button type="button" aria-busy={loading || undefined} {...props} disabled={props.disabled || loading} className={buttonCls(variant, size, className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon: Icon, className, children, ...props }: LinkProps & { variant?: Variant; size?: Size; icon?: LucideIcon }) {
  return (
    <Link {...props} className={buttonCls(variant, size, className)}>
      {Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
      {children}
    </Link>
  );
}

export function IconButton({ icon: Icon, label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...props} className={cx('btn-motion grid size-9 place-items-center rounded-full text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95 disabled:opacity-40', className)}>
      <Icon className="size-[18px]" />
    </button>
  );
}

// ── Layout primitives ───────────────────────────────────────────

export function Card({ children, className, interactive }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return (
    <section className={cx('app-surface group/card rounded-2xl transition-[box-shadow,border-color,translate] duration-300 ease-out', interactive ? 'hover:-translate-y-1 hover:border-slate-300 hover:shadow-card-hover' : 'hover:shadow-card-hover', className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, action, icon: Icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 transition-transform duration-300 ease-out group-hover/card:scale-105"><Icon className="size-4" /></span>}
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold tracking-tight text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.03em] text-slate-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Badges ──────────────────────────────────────────────────────

export const tones = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = 'gray', icon: Icon, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-[background-color,color,box-shadow] duration-300', tones[tone], className)}>
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}

/** Marks a piece of demonstration data. Shown on every demo record. */
export function DemoTag({ className }: { className?: string }) {
  return (
    <span title="Demonstration data — not a real test result" className={cx('inline-flex shrink-0 items-center rounded bg-amber-400 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-amber-950', className)}>
      Demo
    </span>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-400 font-semibold text-ivory ring-2 ring-white/70', size === 'sm' ? 'size-7 text-[11px]' : size === 'lg' ? 'size-16 text-xl' : 'size-9 text-sm')}>
      {initials}
    </span>
  );
}

export function SiteIcon({ name, demo }: { name: string; demo?: boolean }) {
  const palette = ['from-brand-500 to-brand-700', 'from-emerald-500 to-emerald-700', 'from-rose-400 to-rose-600', 'from-sky-500 to-sky-700', 'from-slate-600 to-slate-800'];
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return (
    <span className={cx('relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br font-display text-sm font-bold text-white shadow-sm', palette[idx])}>
      {name.trim()[0]?.toUpperCase() ?? '?'}
      {demo && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-amber-400 ring-2 ring-white" aria-hidden />}
    </span>
  );
}

// ── Stat card ───────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  iconCls = 'bg-brand-50 text-brand-600',
  to,
  demo,
}: {
  label: string;
  /** Numbers count up when the card first comes into view and tween on change. */
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  iconCls?: string;
  to?: string;
  /** Value includes demonstration data. */
  demo?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110', iconCls)}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-2 font-display text-[28px] font-bold leading-none tracking-tight text-slate-900">{typeof value === 'number' ? <CountUp value={value} /> : value}</p>
      {(hint || demo) && (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          {demo && <DemoTag />}
          <span className="truncate">{hint}</span>
        </p>
      )}
    </>
  );
  const cls = 'app-surface group block rounded-2xl p-4.5 transition-all duration-300 ease-out hover:border-slate-300 hover:shadow-card-hover';
  return to ? (
    <Link to={to} className={cx(cls, 'hover:-translate-y-1')}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Fills from 0 on mount, then glides to each new value. `active` adds a light sweep while work is in progress. */
export function ProgressBar({ value, max, className, tone = 'brand', size = 'md', active }: { value: number; max: number; className?: string; tone?: 'brand' | 'green' | 'red'; size?: 'sm' | 'md'; active?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(raf);
  }, []);
  const color = { brand: 'bg-gradient-to-r from-brand-600 to-brand-400', green: 'bg-emerald-500', red: 'bg-rose-500' }[tone];
  return (
    <div className={cx('overflow-hidden rounded-full bg-slate-200/70', size === 'sm' ? 'h-1.5' : 'h-2.5', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', color, active && pct > 0 && 'progress-active')} style={{ width: `${mounted ? pct : 0}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{children}</kbd>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx('border-slate-200/70', className)} />;
}
