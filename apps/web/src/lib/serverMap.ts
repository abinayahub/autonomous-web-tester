/**
 * Maps persisted API records onto the frontend's display types, so the existing pages render real results
 * with their existing components. Nothing is invented: every field comes from the database row.
 */
import { serverBaseUrl, type ServerRun } from './remote';
import type { ServerIssue, ServerProjectRow, ServerReport, ServerShot } from './serverData';
import type { DeviceClass, Issue, ModuleId, Project, Run, Screenshot, ViewportId } from './types';

/** server project id → browser project id (stored link first, then same base URL). */
export function linkProjects(local: Project[], server: ServerProjectRow[]): Map<string, string> {
  const link = new Map<string, string>();
  for (const p of local) {
    if (p.demo) continue;
    let base: string | undefined;
    try {
      base = serverBaseUrl(p.url);
    } catch {
      base = undefined;
    }
    const sp = server.find((x) => x.id === p.remoteProjectId) ?? server.find((x) => x.baseUrl === base);
    if (sp && !link.has(sp.id)) link.set(sp.id, p.id);
  }
  return link;
}

const RUN_STATUS: Record<ServerRun['status'], Run['status']> = {
  QUEUED: 'QUEUED', RUNNING: 'RUNNING', AWAITING_APPROVAL: 'RUNNING', COMPLETED: 'COMPLETED', FAILED: 'FAILED', CANCELLED: 'STOPPED',
};

/** The engine reports images and accessibility separately; the web groups them like the test configuration does. */
const MODULE: Record<string, ModuleId> = {
  UI_LAYOUT: 'UI_LAYOUT', RESPONSIVE: 'RESPONSIVE', BUTTON: 'BUTTON', NAVIGATION: 'NAVIGATION', FORM: 'FORM', PASSWORD: 'PASSWORD',
  FUNCTIONAL: 'FUNCTIONAL', CONSOLE_NETWORK: 'CONSOLE_NETWORK', IMAGE: 'CONSOLE_NETWORK', ACCESSIBILITY: 'UI_LAYOUT',
};

const VIEWPORTS: ViewportId[] = ['desktop-1920', 'desktop-1280', 'tablet-768', 'mobile-375'];
const viewport = (v?: string | null): ViewportId => (VIEWPORTS.includes(v as ViewportId) ? (v as ViewportId) : 'desktop-1280');
const deviceOf = (v?: string | null): DeviceClass => (v?.startsWith('mobile') ? 'MOBILE' : v?.startsWith('tablet') ? 'TABLET' : 'DESKTOP');
const path = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search || '/';
  } catch {
    return url;
  }
};

export function toRun(r: ServerRun, projectId: string): Run {
  return {
    id: r.id, projectId, status: RUN_STATUS[r.status], startedAt: r.startedAt ?? r.queuedAt, finishedAt: r.finishedAt ?? undefined,
    pagesDiscovered: r.pagesDiscovered, testsPassed: r.testsPassed, testsFailed: r.testsFailed, testsFlaky: r.testsFlaky,
    issuesFound: r.confirmedIssues, modules: [],
  };
}

export function toIssue(i: ServerIssue, projectId: string): Issue {
  const steps = Array.isArray(i.stepsToReproduce) ? (i.stepsToReproduce as unknown[]).map(String) : [];
  return {
    id: i.id, key: i.issueKey, projectId, runId: i.runId, title: i.title, description: i.description,
    pageName: i.pageName || path(i.pageUrl), pageUrl: i.pageUrl, module: MODULE[i.module] ?? 'FUNCTIONAL', severity: i.severity, status: i.status,
    classification: i.classification, expected: i.expectedResult, actual: i.actualResult, steps,
    device: i.deviceClass ?? deviceOf(i.viewportId), viewport: viewport(i.viewportId), browser: i.browser ?? 'chromium',
    element: i.element ? `${i.element.selector}${i.element.text ? ` — ${i.element.text}` : ''}` : undefined,
    screenshotIds: i.artifacts.map((a) => a.id), detectedAt: i.createdAt,
  };
}

export function toScreenshot(a: ServerShot, projectId: string): Screenshot {
  const vp = a.metadata?.viewport;
  const pageUrl = a.page?.url ?? a.metadata?.pageUrl ?? a.run.project.baseUrl;
  return {
    id: a.id, projectId, runId: a.runId, issueId: a.issue?.id, kind: a.issue ? 'ISSUE' : 'PAGE',
    label: a.metadata?.label ?? a.issue?.title ?? 'Screenshot', pageName: a.page?.pageName || a.page?.title || path(pageUrl), pageUrl,
    device: deviceOf(a.metadata?.viewportId), width: vp?.width ?? 1280, height: vp?.height ?? 800,
    src: `/api/artifacts/${a.id}/file`, capturedAt: a.createdAt,
  };
}

export interface ReportItem extends ServerReport {
  projectId: string;
  url: string;
}

export const toReport = (r: ServerReport, projectId: string): ReportItem => ({ ...r, projectId, url: `/api/reports/${r.id}/file` });
