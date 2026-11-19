/**
 * Persisted results from PostgreSQL (via the API), shared by every page through useData().
 * Refreshes every 5 s while a run is active, every 30 s otherwise, and when the tab regains focus,
 * so Issues / Screenshots / Reports / Dashboard update after each new test run.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { ServerRun } from './remote';

export interface ServerIssue {
  id: string;
  issueKey: string;
  classification: 'CONFIRMED' | 'FLAKY' | 'NEEDS_REVIEW';
  module: string;
  category: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'FALSE_POSITIVE' | 'FIXED' | 'WONT_FIX';
  pageName: string | null;
  pageUrl: string;
  deviceClass: 'DESKTOP' | 'TABLET' | 'MOBILE' | null;
  viewportId: string | null;
  browser: string | null;
  description: string;
  expectedResult: string;
  actualResult: string;
  stepsToReproduce: unknown;
  createdAt: string;
  runId: string;
  project: { id: string; name: string; baseUrl: string };
  element: { elementType: string; selector: string; text: string | null } | null;
  artifacts: Array<{ id: string; type: string }>;
}

export interface ServerShot {
  id: string;
  type: 'PAGE_SCREENSHOT' | 'ELEMENT_SCREENSHOT';
  metadata: { label?: string; viewport?: { width: number; height: number } | null; viewportId?: string; pageUrl?: string } | null;
  sizeBytes: number;
  createdAt: string;
  runId: string;
  issue: { id: string; issueKey: string; title: string; severity: string } | null;
  page: { url: string; pageName: string | null; title: string | null } | null;
  run: { id: string; queuedAt: string; project: { id: string; name: string; baseUrl: string } };
}

export interface ServerReport {
  id: string;
  format: 'PDF' | 'XLSX';
  sizeBytes: number;
  createdAt: string;
  run: { id: string; status: ServerRun['status']; queuedAt: string; startedAt: string | null; finishedAt: string | null; confirmedIssues: number; project: { id: string; name: string; baseUrl: string } };
}

export interface ServerProjectRow { id: string; name: string; baseUrl: string }

interface ServerData {
  projects: ServerProjectRow[];
  runs: ServerRun[];
  issues: ServerIssue[];
  screenshots: ServerShot[];
  reports: ServerReport[];
  loaded: boolean;
  error?: ApiError;
  reload: () => void;
}

const EMPTY: ServerData = { projects: [], runs: [], issues: [], screenshots: [], reports: [], loaded: false, reload: () => undefined };
const Ctx = createContext<ServerData>(EMPTY);

export function ServerDataProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<Omit<ServerData, 'reload'>>(EMPTY);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const active = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const get = <T,>(p: string) => api<T>(p, { signal: ctrl.signal });
    Promise.all([
      get<{ items: ServerProjectRow[] }>('/projects'),
      get<{ items: ServerRun[] }>('/runs?limit=200'),
      get<{ items: ServerIssue[] }>('/issues?limit=200'),
      get<{ items: ServerShot[] }>('/screenshots?limit=500'),
      get<{ items: ServerReport[] }>('/reports'),
    ])
      .then(([projects, runs, issues, screenshots, reports]) => {
        active.current = runs.items.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING' || r.status === 'AWAITING_APPROVAL');
        setState({ projects: projects.items, runs: runs.items, issues: issues.items, screenshots: screenshots.items, reports: reports.items, loaded: true });
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        // Database not configured yet → behave as "no server data" (browser-only mode), but keep the error visible.
        setState((s) => ({ ...s, loaded: true, error: e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e)) }));
      });
    return () => ctrl.abort();
  }, [enabled, tick]);

  // Polling + refresh on focus.
  useEffect(() => {
    if (!enabled || !state.loaded) return;
    const t = setTimeout(reload, active.current ? 5_000 : 30_000);
    return () => clearTimeout(t);
  }, [enabled, state, reload]);
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useServerData = () => useContext(Ctx);
