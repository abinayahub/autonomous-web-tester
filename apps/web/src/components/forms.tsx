import { motion } from 'motion/react';
import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Eye, EyeOff, Search, type LucideIcon } from 'lucide-react';
import { cx } from './ui';

export const inputBase =
  'block w-full rounded-xl border-0 bg-white/85 px-3.5 py-2 text-sm text-slate-900 shadow-xs ring-1 ring-inset ring-slate-300 transition-[box-shadow,background-color] duration-200 placeholder:text-slate-400 hover:ring-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 focus:shadow-[0_0_0_4px_rgba(165,180,154,0.3)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:ring-rose-400';

export function Field({ label, hint, error, children, htmlFor, required, optional, className }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; required?: boolean; optional?: boolean; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500" aria-hidden>*</span>}
        {optional && <span className="font-normal text-slate-400">(optional)</span>}
      </label>
      {children}
      {error ? <p key={error} className="anim-msg mt-1.5 text-xs font-medium text-rose-600" role="alert">{error}</p> : hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Input({ icon: Icon, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon }) {
  if (!Icon) return <input {...props} className={cx(inputBase, className)} />;
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input {...props} className={cx(inputBase, 'pl-9', className)} />
    </div>
  );
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={cx(inputBase, 'pr-10', props.className)} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx('relative', className)}>
      <select {...props} className={cx(inputBase, 'appearance-none pr-9')}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, 'min-h-24', className)} />;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cx(inputBase, 'pl-9')} />
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex items-start gap-3', className)}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600 disabled:cursor-not-allowed" />
      <label htmlFor={id} className={cx('text-sm', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </label>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean; size?: 'sm' | 'md' }) {
  const id = useId();
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === 'string' ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'bg-brand-600' : 'bg-slate-300',
      )}
    >
      <span className={cx('inline-block rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)]', size === 'sm' ? 'size-4' : 'size-5', checked ? (size === 'sm' ? 'translate-x-4.5' : 'translate-x-5.5') : 'translate-x-0.5')} />
    </button>
  );
  if (!label) return sw;
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </label>
      {sw}
    </div>
  );
}

/** Large selectable option card (radio semantics). */
export function OptionCard({ selected, onSelect, icon: Icon, title, description, badge }: { selected: boolean; onSelect: () => void; icon?: LucideIcon; title: ReactNode; description?: ReactNode; badge?: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'group relative flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-200 ease-out',
        selected ? 'border-brand-600 bg-brand-50/70 ring-1 ring-brand-600' : 'border-slate-200 bg-white/80 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-card-hover',
      )}
    >
      {Icon && (
        <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-200', selected ? 'bg-brand-600 text-ivory' : 'bg-slate-100 text-slate-500 group-hover:text-slate-700')}>
          <Icon className="size-[18px]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">{title}{badge}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>}
      </span>
      <span className={cx('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors', selected ? 'border-brand-600' : 'border-slate-300')}>
        <span className={cx('size-2 rounded-full bg-brand-600 transition-[opacity,scale] duration-200', selected ? 'scale-100 opacity-100' : 'scale-0 opacity-0')} />
      </span>
    </button>
  );
}

/** Pill-style tab / segmented control. */
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode; count?: number; icon?: LucideIcon }>; className?: string }) {
  const pillId = useId();
  return (
    <div role="tablist" className={cx('inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-slate-200/60 p-1 ring-1 ring-inset ring-slate-300/40', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200',
            value === it.value ? 'text-slate-900' : 'text-slate-500 hover:bg-white/50 hover:text-slate-800',
          )}
        >
          {/* The white pill slides between tabs */}
          {value === it.value && <motion.span layoutId={`tab-pill-${pillId}`} transition={{ type: 'spring', stiffness: 460, damping: 38 }} className="absolute inset-0 rounded-full bg-white shadow-[0_2px_8px_-2px_rgba(32,55,45,0.18)]" aria-hidden />}
          {it.icon && <it.icon className="relative size-4" />}
          <span className="relative inline-flex items-center">{it.label}</span>
          {it.count !== undefined && <span className={cx('relative rounded-full px-1.5 text-[11px] tabular-nums transition-colors duration-200', value === it.value ? 'bg-brand-50 text-brand-700' : 'bg-slate-200/70 text-slate-500')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
