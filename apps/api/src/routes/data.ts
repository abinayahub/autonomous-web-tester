import { Router } from 'express';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { getPrisma, type Prisma } from '@awt/db';
import { FindingClassification, IssueStatus, RunStatus, Severity, resolveInsideStorage, resolveStorageDir, type AppConfig } from '@awt/shared';
import { HttpError, dbRoute } from '../http.js';

const uuid = z.string().uuid();
const page = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new HttpError(400, 'validation_failed', 'Invalid request parameters.', {
      fields: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

const idParam = (v: unknown) => parse(z.object({ id: uuid }), v).id;

const ACTIVE: RunStatus[] = ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'];

const runSelect = {
  id: true,
  status: true,
  pagesDiscovered: true,
  testsTotal: true,
  testsPassed: true,
  testsFailed: true,
  testsFlaky: true,
  confirmedIssues: true,
  reviewItems: true,
  errorMessage: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  project: { select: { id: true, name: true, baseUrl: true } },
  reports: { select: { id: true, createdAt: true, sizeBytes: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.TestRunSelect;

const issueListSelect = {
  id: true,
  issueKey: true,
  classification: true,
  module: true,
  category: true,
  title: true,
  severity: true,
  status: true,
  pageName: true,
  pageUrl: true,
  deviceClass: true,
  viewportId: true,
  browser: true,
  description: true,
  expectedResult: true,
  actualResult: true,
  stepsToReproduce: true,
  createdAt: true,
  runId: true,
  project: { select: { id: true, name: true, baseUrl: true } },
  element: { select: { elementType: true, selector: true, text: true } },
  artifacts: {
    where: { type: { in: ['PAGE_SCREENSHOT', 'ELEMENT_SCREENSHOT'] } },
    select: { id: true, type: true },
    take: 5,
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.IssueSelect;

/** Screenshot evidence for the gallery: the stored artifact plus the issue, page and run it belongs to. */
const screenshotSelect = {
  id: true,
  type: true,
  metadata: true,
  sizeBytes: true,
  createdAt: true,
  runId: true,
  issue: { select: { id: true, issueKey: true, title: true, severity: true } },
  page: { select: { url: true, pageName: true, title: true } },
  run: { select: { id: true, queuedAt: true, project: { select: { id: true, name: true, baseUrl: true } } } },
} satisfies Prisma.ArtifactSelect;

function sendStoredFile(config: AppConfig, storagePath: string, res: import('express').Response) {
  if (config.STORAGE_DRIVER !== 'local') {
    throw new HttpError(501, 'storage_driver_unsupported', 'Only local artifact storage is served in this version.');
  }
  const root = resolveStorageDir(config.STORAGE_LOCAL_DIR);
  const full = resolveInsideStorage(root, storagePath);
  if (!full) throw new HttpError(400, 'invalid_storage_path', 'Stored file path is outside the storage directory.');
  if (!existsSync(full)) throw new HttpError(404, 'file_missing', 'The stored file no longer exists on disk.');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(full);
}

export function dataRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/dashboard/summary', dbRoute(async (_req, res) => {
    const db = getPrisma();
    const [projects, runs, totals, latestRun, activeRuns, issuesByClass, openBySeverity] = await Promise.all([
      db.project.count(),
      db.testRun.count(),
      db.testRun.aggregate({
        _sum: { pagesDiscovered: true, testsPassed: true, testsFailed: true, testsFlaky: true, confirmedIssues: true, reviewItems: true },
      }),
      db.testRun.findFirst({ orderBy: { queuedAt: 'desc' }, select: runSelect }),
      db.testRun.findMany({ where: { status: { in: ACTIVE } }, orderBy: { queuedAt: 'desc' }, select: runSelect, take: 5 }),
      db.issue.groupBy({ by: ['classification'], _count: { _all: true } }),
      db.issue.groupBy({ by: ['severity'], where: { status: 'OPEN', classification: 'CONFIRMED' }, _count: { _all: true } }),
    ]);
    res.json({
      projects,
      runs,
      totals: {
        pagesDiscovered: totals._sum.pagesDiscovered ?? 0,
        testsPassed: totals._sum.testsPassed ?? 0,
        testsFailed: totals._sum.testsFailed ?? 0,
        testsFlaky: totals._sum.testsFlaky ?? 0,
        confirmedIssues: totals._sum.confirmedIssues ?? 0,
        reviewItems: totals._sum.reviewItems ?? 0,
      },
      issuesByClassification: Object.fromEntries(issuesByClass.map((g) => [g.classification, g._count._all])),
      openConfirmedBySeverity: Object.fromEntries(openBySeverity.map((g) => [g.severity, g._count._all])),
      latestRun,
      activeRuns,
    });
  }));

  router.get('/projects', dbRoute(async (_req, res) => {
    const projects = await getPrisma().project.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        environment: true,
        allowedDomains: true,
        authorizationConfirmedAt: true,
        createdAt: true,
        _count: { select: { runs: true, credentials: true, issues: { where: { status: 'OPEN', classification: 'CONFIRMED' } } } },
        // Which test logins are stored (encrypted) — never the secrets themselves.
        credentials: { select: { roleName: true, loginUrl: true, updatedAt: true } },
        runs: { orderBy: { queuedAt: 'desc' }, take: 1, select: { id: true, status: true, queuedAt: true, finishedAt: true } },
      },
    });
    res.json({ items: projects });
  }));

  router.get('/runs', dbRoute(async (req, res) => {
    const q = parse(z.object({ ...page, projectId: uuid.optional(), status: z.enum(RunStatus).optional() }), req.query);
    const where: Prisma.TestRunWhereInput = { projectId: q.projectId, status: q.status };
    const [items, total] = await Promise.all([
      getPrisma().testRun.findMany({ where, orderBy: { queuedAt: 'desc' }, take: q.limit, skip: q.offset, select: runSelect }),
      getPrisma().testRun.count({ where }),
    ]);
    res.json({ items, total });
  }));

  router.get('/runs/:id', dbRoute(async (req, res) => {
    const id = idParam(req.params);
    const db = getPrisma();
    const run = await db.testRun.findUnique({ where: { id }, select: { ...runSelect, testsTotal: true, aiTokensUsed: true } });
    if (!run) throw new HttpError(404, 'not_found', 'Test run not found.');
    const [modules, pagesTested, events, pendingApprovals, auth, authPages] = await Promise.all([
      db.testCase.groupBy({ by: ['module', 'status'], where: { runId: id }, _count: { _all: true } }),
      db.page.count({ where: { runId: id, testCases: { some: {} } } }),
      db.runEvent.findMany({ where: { runId: id }, orderBy: { id: 'desc' }, take: 100, select: { id: true, level: true, type: true, message: true, createdAt: true } }),
      db.approval.count({ where: { runId: id, status: 'PENDING' } }),
      // Sign-in results are kept separately so they never scroll out of the latest-100 event window.
      db.runEvent.findMany({
        where: { runId: id, type: { in: ['auth.summary', 'auth.login', 'auth.failed', 'auth.session_lost', 'auth.route_denied'] } },
        orderBy: { id: 'asc' }, take: 50, select: { id: true, level: true, type: true, message: true, data: true, createdAt: true },
      }),
      db.page.count({ where: { runId: id, requiresAuth: true, statusCode: { not: null } } }),
    ]);
    res.json({
      ...run,
      pagesTested,
      pendingApprovals,
      auth,
      authPages,
      modules: modules.map((m) => ({ module: m.module, status: m.status, count: m._count._all })),
      events,
    });
  }));

  router.get('/issues', dbRoute(async (req, res) => {
    const q = parse(
      z.object({
        ...page,
        runId: uuid.optional(),
        projectId: uuid.optional(),
        classification: z.enum(FindingClassification).optional(),
        severity: z.enum(Severity).optional(),
        status: z.enum(IssueStatus).optional(),
      }),
      req.query,
    );
    const where: Prisma.IssueWhereInput = {
      runId: q.runId,
      projectId: q.projectId,
      classification: q.classification,
      severity: q.severity,
      status: q.status,
    };
    const [items, total] = await Promise.all([
      getPrisma().issue.findMany({ where, orderBy: [{ createdAt: 'desc' }], take: q.limit, skip: q.offset, select: issueListSelect }),
      getPrisma().issue.count({ where }),
    ]);
    res.json({ items, total });
  }));

  router.get('/issues/:id', dbRoute(async (req, res) => {
    const id = idParam(req.params);
    const issue = await getPrisma().issue.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, baseUrl: true } },
        element: { select: { elementType: true, selector: true, accessibleName: true, text: true } },
        artifacts: { select: { id: true, type: true, mimeType: true, sizeBytes: true, metadata: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!issue) throw new HttpError(404, 'not_found', 'Issue not found.');
    const { fingerprint: _fp, ...rest } = issue;
    res.json(rest);
  }));

  router.get('/screenshots', dbRoute(async (req, res) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).default(300), offset: page.offset, projectId: uuid.optional(), runId: uuid.optional(), issueId: uuid.optional() }), req.query);
    const where: Prisma.ArtifactWhereInput = {
      type: { in: ['PAGE_SCREENSHOT', 'ELEMENT_SCREENSHOT'] },
      runId: q.runId,
      issueId: q.issueId,
      run: q.projectId ? { projectId: q.projectId } : undefined,
    };
    const [items, total] = await Promise.all([
      getPrisma().artifact.findMany({ where, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset, select: screenshotSelect }),
      getPrisma().artifact.count({ where }),
    ]);
    res.json({ items, total });
  }));

  router.get('/reports', dbRoute(async (_req, res) => {
    const items = await getPrisma().report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        format: true,
        sizeBytes: true,
        createdAt: true,
        run: { select: { id: true, status: true, queuedAt: true, startedAt: true, finishedAt: true, confirmedIssues: true, project: { select: { id: true, name: true, baseUrl: true } } } },
      },
    });
    res.json({ items });
  }));

  router.get('/reports/:id/file', dbRoute(async (req, res) => {
    const report = await getPrisma().report.findUnique({ where: { id: idParam(req.params) }, select: { storagePath: true, format: true } });
    if (!report) throw new HttpError(404, 'not_found', 'Report not found.');
    sendStoredFile(config, report.storagePath, res);
  }));

  router.get('/artifacts/:id/file', dbRoute(async (req, res) => {
    const artifact = await getPrisma().artifact.findUnique({ where: { id: idParam(req.params) }, select: { storagePath: true, mimeType: true } });
    if (!artifact) throw new HttpError(404, 'not_found', 'Artifact not found.');
    res.type(artifact.mimeType);
    sendStoredFile(config, artifact.storagePath, res);
  }));

  return router;
}
