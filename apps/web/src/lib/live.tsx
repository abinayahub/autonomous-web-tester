import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { moduleInfo } from './catalog';
import { DEMO_SITE_PAGES } from './demo';
import { useStore } from './store';
import type { ModuleId, Project, TestConfig } from './types';

/**
 * DEMO SIMULATION of a live test run — for previewing the Live Testing UI only.
 * It can only target demo projects (fictional .example sites) and stops automatically
 * when Demo mode is switched off. Real runs arrive with the backend test engine.
 */

export type LiveStatus = 'RUNNING' | 'STOPPING' | 'STOPPED' | 'COMPLETED';
export type LogLevel = 'info' | 'pass' | 'fail' | 'warn' | 'discover';

export interface LivePage {
  path: string;
  state: 'queued' | 'testing' | 'done';
  failures: number;
}

export interface LiveRun {
  id: string;
  project: Project;
  config: TestConfig;
  status: LiveStatus;
  startedAt: number;
  finishedAt?: number;
  pages: LivePage[];
  totalPages: number;
  currentPath?: string;
  currentModule?: ModuleId;
  testsPlanned: number;
  passed: number;
  failed: number;
  log: Array<{ id: number; at: number; level: LogLevel; message: string }>;
  moduleDone: Partial<Record<ModuleId, { passed: number; failed: number }>>;
}

interface LiveCtx {
  run?: LiveRun;
  start: (project: Project, config: TestConfig) => void;
  stop: () => void;
  clear: () => void;
}

const Ctx = createContext<LiveCtx | null>(null);
const TICK_MS = 420;

// Deterministic pseudo-random so a demo looks the same each time.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const FAIL_MESSAGES: Partial<Record<ModuleId, string>> = {
  UI_LAYOUT: 'overlapping elements detected',
  RESPONSIVE: 'horizontal overflow on Mobile 375',
  BUTTON: 'button click produced no observable effect',
  NAVIGATION: 'link resolved to HTTP 404',
  FORM: 'invalid email accepted by form',
  PASSWORD: 'weak password accepted',
  FUNCTIONAL: 'cart count unchanged after add-to-cart',
  CONSOLE_NETWORK: 'uncaught TypeError in console',
};

export function LiveRunProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<LiveRun>();
  const store = useStore();
  const step = useRef({ page: 0, module: 0, logId: 0, rand: rng(7) });

  const start = useCallback<LiveCtx['start']>((project, config) => {
    if (!project.demo) return; // never simulate against a real site
    const paths = DEMO_SITE_PAGES[project.id] ?? ['/'];
    step.current = { page: 0, module: 0, logId: 1, rand: rng(project.id.length * 97 + 11) };
    const now = Date.now();
    setRun({
      id: `sim-${now}`,
      project,
      config,
      status: 'RUNNING',
      startedAt: now,
      pages: [{ path: paths[0]!, state: 'queued', failures: 0 }],
      totalPages: paths.length,
      testsPlanned: paths.length * config.modules.length,
      passed: 0,
      failed: 0,
      moduleDone: {},
      log: [{ id: 0, at: now, level: 'info', message: `Demo simulation started for ${project.url} — ${config.modules.length} modules, ${config.viewports.length} viewports` }],
    });
  }, []);

  const stop = useCallback(() => setRun((r) => (r && r.status === 'RUNNING' ? { ...r, status: 'STOPPING' } : r)), []);
  const clear = useCallback(() => setRun(undefined), []);

  // Stop when demo mode is turned off.
  useEffect(() => {
    if (!store.preferences.demoMode) setRun(undefined);
  }, [store.preferences.demoMode]);

  useEffect(() => {
    if (!run || (run.status !== 'RUNNING' && run.status !== 'STOPPING')) return;
    // The next state is computed here (not inside a setState updater) because it advances
    // the step cursor — React StrictMode would otherwise run it twice.
    const t = setTimeout(() => {
      setRun(((r: LiveRun): LiveRun => {
        const now = Date.now();
        const st = step.current;
        const log = [...r.log];
        const push = (level: LogLevel, message: string) => log.push({ id: st.logId++, at: now, level, message });

        if (r.status === 'STOPPING') {
          push('warn', 'Stop requested — finishing current test and closing the browser');
          return { ...r, status: 'STOPPED', finishedAt: now, currentModule: undefined, currentPath: undefined, log: log.slice(-300), pages: r.pages.map((p) => (p.state === 'testing' ? { ...p, state: 'queued' } : p)) };
        }

        const allPaths = DEMO_SITE_PAGES[r.project.id] ?? ['/'];
        const pages = r.pages.map((p) => ({ ...p }));
        const page = pages[st.page];
        if (!page) {
          push('info', `Run complete — ${r.passed} passed, ${r.failed} failed across ${pages.length} pages`);
          return { ...r, status: 'COMPLETED', finishedAt: now, currentModule: undefined, currentPath: undefined, log, pages };
        }
        const mod = r.config.modules[st.module]!;
        if (st.module === 0) {
          page.state = 'testing';
          push('info', `Testing ${page.path}`);
          // Discovery: each visited page reveals up to two new pages.
          for (let k = 0; k < 2 && pages.length < allPaths.length; k++) {
            const path = allPaths[pages.length]!;
            pages.push({ path, state: 'queued', failures: 0 });
            push('discover', `Discovered ${path} (linked from ${page.path})`);
          }
        }
        const fail = st.rand() < 0.07;
        const md = { ...r.moduleDone, [mod]: { passed: (r.moduleDone[mod]?.passed ?? 0) + (fail ? 0 : 1), failed: (r.moduleDone[mod]?.failed ?? 0) + (fail ? 1 : 0) } };
        if (fail) {
          page.failures += 1;
          push('fail', `${moduleInfo(mod).name} · ${page.path} — ${FAIL_MESSAGES[mod] ?? 'check failed'}`);
        } else {
          push('pass', `${moduleInfo(mod).name} · ${page.path} — passed`);
        }
        st.module += 1;
        if (st.module >= r.config.modules.length) {
          page.state = 'done';
          st.module = 0;
          st.page += 1;
        }
        return {
          ...r,
          pages,
          currentPath: page.path,
          currentModule: mod,
          passed: r.passed + (fail ? 0 : 1),
          failed: r.failed + (fail ? 1 : 0),
          moduleDone: md,
          log: log.slice(-300),
        };
      })(run));
    }, TICK_MS);
    return () => clearTimeout(t);
  }, [run]);

  const value = useMemo(() => ({ run, start, stop, clear }), [run, start, stop, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveRun(): LiveCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLiveRun must be used inside LiveRunProvider');
  return c;
}
