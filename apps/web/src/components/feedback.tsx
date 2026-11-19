import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { cx } from './ui';

// ── Empty state ─────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, children, action, compact }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      {Icon && (
        <span className="empty-icon mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-white to-brand-50 text-brand-600 ring-1 ring-brand-600/10">
          <Icon className="size-5" />
        </span>
      )}
      <p className="anim-rise font-display text-[15px] font-bold tracking-tight text-slate-900" style={{ '--delay': '160ms' } as React.CSSProperties}>{title}</p>
      {children && <div className="anim-rise mt-1.5 max-w-md text-sm leading-relaxed text-slate-500" style={{ '--delay': '220ms' } as React.CSSProperties}>{children}</div>}
      {action && <div className="anim-rise mt-5 flex flex-wrap justify-center gap-2" style={{ '--delay': '280ms' } as React.CSSProperties}>{action}</div>}
    </div>
  );
}

// ── Notice ──────────────────────────────────────────────────────

const noticeMap = {
  info: { cls: 'border-sky-200 bg-sky-50/70 text-sky-950', icon: Info, iconCls: 'text-sky-600' },
  warn: { cls: 'border-amber-200 bg-amber-50/80 text-amber-950', icon: AlertTriangle, iconCls: 'text-amber-600' },
  error: { cls: 'border-rose-200 bg-rose-50/80 text-rose-950', icon: XCircle, iconCls: 'text-rose-600' },
  success: { cls: 'border-emerald-200 bg-emerald-50/80 text-emerald-950', icon: CheckCircle2, iconCls: 'text-emerald-600' },
};

export function Notice({ kind = 'info', title, children, action, className }: { kind?: keyof typeof noticeMap; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const m = noticeMap[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('anim-rise flex gap-3 rounded-2xl border p-4 text-sm', m.cls, className)}>
      <m.icon className={cx('mt-px size-[18px] shrink-0', m.iconCls)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx('leading-relaxed opacity-90', Boolean(title) && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <motion.div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[3px]" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
          <motion.div
            ref={ref}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, scale: 0.98, filter: 'blur(4px)' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cx('relative max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-white/80 bg-white/95 shadow-[0_40px_80px_-30px_rgba(32,55,45,0.45)] outline-none backdrop-blur-xl', size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl')}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-5">
              <div>
                <h2 id="modal-title" className="font-display text-lg font-bold tracking-tight text-slate-900">{title}</h2>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
              </div>
              <button onClick={onClose} className="-mr-2 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Close dialog">
                <X className="size-5" />
              </button>
            </div>
            {children && <div className="px-6 py-4">{children}</div>}
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200/70 bg-slate-50/70 px-6 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Toasts ──────────────────────────────────────────────────────

interface Toast { id: number; kind: 'success' | 'info' | 'warn' | 'error'; title: string; body?: string }
const TOAST_MS = 4500;
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), TOAST_MS);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const m = noticeMap[t.kind];
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="app-glass pointer-events-auto relative flex gap-3 overflow-hidden rounded-2xl p-4 text-sm">
              <m.icon className={cx('mt-px size-[18px] shrink-0', m.iconCls)} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{t.title}</p>
                {t.body && <p className="mt-0.5 text-slate-500">{t.body}</p>}
              </div>
              <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} className="self-start rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss">
                <X className="size-4" />
              </button>
              <span aria-hidden className="toast-timer absolute bottom-0 left-0 h-0.5 rounded-full bg-brand-300/80" style={{ '--toast-ms': `${TOAST_MS}ms` } as React.CSSProperties} />
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
