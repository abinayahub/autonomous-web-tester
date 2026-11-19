import { useEffect, useRef, type CSSProperties } from 'react';
import { Bug, Compass, Navigation, TextCursorInput, type LucideIcon } from 'lucide-react';
import { prefersReducedMotion } from '../../components/motion';
import type { LiveRun } from '../../lib/live';
import type { ModuleId, Run } from '../../lib/types';

/**
 * Gentle 3-D tilt that follows the pointer (max a few degrees) plus a soft spotlight (--mx/--my).
 * Only on fine pointers and when the viewer hasn't asked for reduced motion.
 */
export function useTilt<T extends HTMLElement>(max = 3.5) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia?.('(pointer: fine)').matches || prefersReducedMotion()) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--ry', `${(x * max * 2).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(-y * max * 2).toFixed(2)}deg`);
        el.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [max]);
  return ref;
}

/** Pulsing radar dot used as a scanning / status indicator. */
export function Radar({ className, idle }: { className?: string; idle?: boolean }) {
  return <span aria-hidden className={`radar ${idle ? 'radar-idle' : ''} ${className ?? ''}`}><i /></span>;
}

/** Splits a heading into words that rise in one after another. */
export function RiseWords({ text, offset = 0, className }: { text: string; offset?: number; className?: string }) {
  return (
    <span className={`word-rise ${className ?? ''}`} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} aria-hidden style={{ '--w': i + offset } as CSSProperties}>{w}&nbsp;</span>
      ))}
    </span>
  );
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ── Testing stages ──────────────────────────────────────────────

export type StageKey = 'discover' | 'navigation' | 'forms' | 'issues';
export interface Stage {
  key: StageKey;
  label: string;
  icon: LucideIcon;
  modules: ModuleId[];
}
export const STAGES: Stage[] = [
  { key: 'discover', label: 'Discovering pages', icon: Compass, modules: [] },
  { key: 'navigation', label: 'Checking navigation', icon: Navigation, modules: ['NAVIGATION', 'BUTTON', 'UI_LAYOUT', 'RESPONSIVE'] },
  { key: 'forms', label: 'Testing forms', icon: TextCursorInput, modules: ['FORM', 'PASSWORD', 'FUNCTIONAL'] },
  { key: 'issues', label: 'Detecting issues', icon: Bug, modules: ['CONSOLE_NETWORK'] },
];

export type StageState = 'waiting' | 'active' | 'done' | 'skipped';
export interface StageStatus {
  stage: Stage;
  state: StageState;
  /** 0..1 — real progress, never estimated. */
  progress: number;
  detail: string;
}

/** Stage progress computed from a live run (demo simulation until the engine is connected). */
export function stagesFromLive(run: LiveRun): StageStatus[] {
  const running = run.status === 'RUNNING' || run.status === 'STOPPING';
  const done = run.passed + run.failed;
  return STAGES.map((stage) => {
    if (stage.key === 'discover') {
      const p = run.totalPages ? run.pages.length / run.totalPages : 0;
      return { stage, progress: p, state: p >= 1 ? 'done' : running ? 'active' : 'waiting', detail: `${run.pages.length} of ${run.totalPages} pages` };
    }
    if (stage.key === 'issues') {
      const p = run.testsPlanned ? done / run.testsPlanned : 0;
      return { stage, progress: p, state: run.status === 'COMPLETED' ? 'done' : running ? 'active' : 'waiting', detail: run.failed ? `${run.failed} failure${run.failed === 1 ? '' : 's'} to verify` : 'No failures so far' };
    }
    const sel = stage.modules.filter((m) => run.config.modules.includes(m));
    if (!sel.length) return { stage, progress: 0, state: 'skipped', detail: 'Not selected' };
    const count = sel.reduce((a, m) => a + (run.moduleDone[m]?.passed ?? 0) + (run.moduleDone[m]?.failed ?? 0), 0);
    const p = count / (sel.length * run.totalPages);
    const isCurrent = running && !!run.currentModule && sel.includes(run.currentModule);
    return { stage, progress: p, state: p >= 1 ? 'done' : isCurrent ? 'active' : count > 0 && running ? 'active' : 'waiting', detail: `${count} of ${sel.length * run.totalPages} checks` };
  });
}

/** Stage summary for the latest completed run. */
export function stagesFromRun(r: Run): StageStatus[] {
  return STAGES.map((stage) => {
    if (stage.key === 'discover') return { stage, progress: 1, state: 'done', detail: `${r.pagesDiscovered} pages found` };
    if (stage.key === 'issues') return { stage, progress: 1, state: 'done', detail: `${r.issuesFound} issue${r.issuesFound === 1 ? '' : 's'} found` };
    const sel = stage.modules.filter((m) => r.modules.includes(m));
    return sel.length ? { stage, progress: 1, state: 'done', detail: `${sel.length} module${sel.length === 1 ? '' : 's'} checked` } : { stage, progress: 0, state: 'skipped', detail: 'Not in this run' };
  });
}

export const idleStages = (): StageStatus[] => STAGES.map((stage) => ({ stage, progress: 0, state: 'waiting', detail: 'Waiting for a test run' }));
