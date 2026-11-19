/**
 * Real test runs (PostgreSQL via the API). Browser-saved projects are linked to their server project
 * by URL; everything shown from here is what the engine actually recorded.
 */
import { api, useApi, ApiError } from './api';
import type { Project, TestConfig } from './types';

export type ServerRunStatus = 'QUEUED' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ServerRun {
  id: string;
  status: ServerRunStatus;
  pagesDiscovered: number;
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  testsFlaky: number;
  confirmedIssues: number;
  reviewItems: number;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  project: { id: string; name: string; baseUrl: string };
  reports: Array<{ id: string; createdAt: string; sizeBytes: number }>;
}

export interface ServerRunDetail extends ServerRun {
  pagesTested: number;
  modules: Array<{ module: string; status: string; count: number }>;
  events: Array<{ id: string; level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'; type: string; message: string; createdAt: string }>;
  /** Sign-in results for the run's test logins (always complete, independent of the event window). */
  auth?: Array<{ id: string; level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'; type: string; message: string; createdAt: string; data: unknown }>;
  /** Pages that were loaded signed in. */
  authPages?: number;
}

/** One test login's outcome, as recorded by the engine ("auth.summary" event). */
export interface AuthSummary {
  role: string;
  status: 'SIGNED_IN' | 'FAILED';
  roleCheck?: string;
  roleConfirmed?: boolean;
  dashboardUrl?: string;
  evidence?: string;
  error?: string;
  pages: number;
  sessionLost?: string;
}

interface ServerProject { id: string; baseUrl: string; name: string; credentials?: Array<{ roleName: string; loginUrl: string | null; updatedAt: string }> }

/** A test login typed in for one run; sent once to the API, which stores it encrypted. Never kept in the browser. */
export interface TestLoginInput { roleName: string; username: string; password: string; loginUrl?: string; successIndicator?: string }

export const ACTIVE_STATUSES: ServerRunStatus[] = ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'];
export const isActive = (r?: { status: ServerRunStatus }) => !!r && ACTIVE_STATUSES.includes(r.status);

/** Same rule the API uses for Project.baseUrl: origin + path without trailing slash. */
export function serverBaseUrl(url: string): string {
  const u = new URL(url);
  return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, ''));
}

/** The server project for a browser project (by stored id, else by URL). */
export function useServerProject(project?: Project) {
  const list = useApi<{ items: ServerProject[] }>(project && !project.demo ? '/projects' : null);
  if (!project || project.demo) return { id: undefined, storedRoles: [] as string[], loading: false, error: undefined, reload: list.reload };
  let base: string | undefined;
  try {
    base = serverBaseUrl(project.url);
  } catch {
    base = undefined;
  }
  const match = list.data?.items.find((p) => p.id === project.remoteProjectId) ?? list.data?.items.find((p) => p.baseUrl === base);
  return { id: match?.id, storedRoles: (match?.credentials ?? []).map((c) => c.roleName), loading: list.loading, error: list.error, reload: list.reload };
}

/** Runs of a server project, refreshed every 2 s while one is queued or running. */
export function useServerRuns(serverProjectId?: string) {
  return useApi<{ items: ServerRun[]; total: number }>(
    serverProjectId ? `/runs?projectId=${serverProjectId}&limit=20` : null,
    (d) => (d?.items.some((r) => isActive(r) || awaitingReport(r)) ? 2_000 : undefined),
  );
}

const awaitingReport = (r: ServerRun) => r.status === 'COMPLETED' && !r.reports.length && !!r.finishedAt && Date.now() - new Date(r.finishedAt).getTime() < 120_000;

export function useServerRun(runId?: string) {
  return useApi<ServerRunDetail>(runId ? `/runs/${runId}` : null, (d) => (!d || isActive(d) ? 1_500 : awaitingReport(d) ? 2_000 : undefined));
}

/**
 * The web configuration has 8 module groups; the engine reports images and accessibility separately,
 * so they ride along with the groups that already cover them.
 */
function engineModules(cfg: TestConfig): string[] {
  const out = new Set<string>(cfg.modules);
  if (cfg.modules.includes('CONSOLE_NETWORK')) out.add('IMAGE');
  if (cfg.modules.includes('UI_LAYOUT')) out.add('ACCESSIBILITY');
  return [...out];
}

export interface StartResult { runId: string; jobId: string; projectId: string; status: ServerRunStatus }

/** Creates the run in PostgreSQL and queues it. Throws ApiError with the server's reason when it can't start. */
export function startServerRun(project: Project, cfg: TestConfig, credentials: TestLoginInput[] = []): Promise<StartResult> {
  return api<StartResult>('/runs', {
    method: 'POST',
    body: {
      targetUrl: project.url,
      projectName: project.name,
      authorizationConfirmed: true,
      environment: project.environment,
      modules: engineModules(cfg),
      viewports: cfg.viewports,
      maxPages: Math.min(300, Math.max(1, cfg.maxPages)),
      maxDepth: Math.min(10, Math.max(0, cfg.maxDepth)),
      credentials: credentials.map((c) => ({
        roleName: c.roleName, username: c.username, password: c.password,
        ...(c.loginUrl ? { loginUrl: c.loginUrl } : {}), ...(c.successIndicator ? { successIndicator: c.successIndicator } : {}),
      })),
    },
  });
}

export function cancelServerRun(runId: string) {
  return api<{ runId: string }>(`/runs/${runId}/cancel`, { method: 'POST' });
}

/** One readable sentence for a failed start (reasons/field errors included). */
export function describeStartError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Unexpected error while starting the test.';
  const extra = e.reasons.length ? ` ${e.reasons.join(' ')}` : e.fields.length ? ` ${e.fields.map((f) => `${f.path}: ${f.message}`).join('; ')}` : '';
  return `${e.message}${extra}`;
}

export const STAGE_LABEL: Record<string, string> = {
  connecting: 'Connecting to website',
  discovering: 'Discovering pages',
  navigation: 'Analysing navigation & links',
  technical: 'Checking technical errors',
  buttons: 'Testing buttons',
  forms: 'Validating forms',
  responsive: 'Checking responsive layouts',
  authenticated: 'Signing in & checking role',
  report: 'Generating report',
  done: 'Finished',
};
export const STAGE_ORDER = ['connecting', 'discovering', 'navigation', 'technical', 'buttons', 'forms', 'responsive', 'report'];
/** Stage order for a run with test logins: sign-in happens before discovery. */
export const STAGE_ORDER_AUTH = ['connecting', 'authenticated', 'discovering', 'navigation', 'technical', 'buttons', 'forms', 'responsive', 'report'];
