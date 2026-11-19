import { Router } from 'express';
import { z } from 'zod';
import { JobStatus } from '@awt/shared';
import { PING_JOB, activeWorkers, cancelJob, enqueueJob, getPrisma, queueStats, type Job } from '@awt/db';
import { HttpError, dbRoute } from '../http.js';

const uuid = z.string().uuid();

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new HttpError(400, 'validation_failed', 'Invalid request parameters.', {
      fields: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

/** Public job shape: no lock internals beyond what helps debugging. */
const view = (j: Job) => ({
  id: j.id,
  type: j.type,
  status: j.status,
  attempts: j.attempts,
  maxAttempts: j.maxAttempts,
  priority: j.priority,
  runId: j.runId,
  worker: j.lockedBy,
  lastError: j.lastError,
  result: j.result,
  runAt: j.runAt,
  createdAt: j.createdAt,
  startedAt: j.startedAt,
  finishedAt: j.finishedAt,
  heartbeatAt: j.heartbeatAt,
});

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function jobsRouter(): Router {
  const router = Router();

  /** Queue overview: job counts by status and live workers. */
  router.get('/queue', dbRoute(async (_req, res) => {
    const [stats, workers] = await Promise.all([queueStats(), activeWorkers()]);
    const running = await getPrisma().job.groupBy({ by: ['lockedBy'], where: { status: 'RUNNING' }, _count: { _all: true } });
    res.json({
      ...stats,
      workers: workers.map((w) => ({ ...w, runningJobs: running.find((r) => r.lockedBy === w.id)?._count._all ?? 0 })),
    });
  }));

  router.get('/jobs', dbRoute(async (req, res) => {
    const q = parse(z.object({
      status: z.enum(JobStatus).optional(),
      type: z.string().max(100).optional(),
      runId: uuid.optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }), req.query);
    const jobs = await getPrisma().job.findMany({
      where: { status: q.status, type: q.type, runId: q.runId },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    });
    res.json({ items: jobs.map(view) });
  }));

  router.get('/jobs/:id', dbRoute(async (req, res) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const job = await getPrisma().job.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, 'not_found', 'Job not found.');
    res.json(view(job));
  }));

  router.post('/jobs/:id/cancel', dbRoute(async (req, res) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const job = await cancelJob(id);
    if (!job) throw new HttpError(404, 'not_found', 'Job not found.');
    if (job.status !== 'CANCELLED') throw new HttpError(409, 'not_cancellable', `Job is already ${job.status.toLowerCase()}.`, { status: job.status });
    res.json(view(job));
  }));

  /** Stop testing: cancels the run's active job (the worker aborts on its next heartbeat). */
  router.post('/runs/:id/cancel', dbRoute(async (req, res) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const job = await getPrisma().job.findFirst({ where: { runId: id, status: { in: ['PENDING', 'RUNNING'] } }, orderBy: { createdAt: 'desc' } });
    if (!job) throw new HttpError(409, 'not_cancellable', 'This run has no queued or running job.');
    const cancelled = await cancelJob(job.id, 'Stopped by user');
    res.json({ runId: id, job: cancelled && view(cancelled) });
  }));

  /**
   * Queue diagnostic: enqueues a ping job that a worker answers. With ?waitMs=…, waits (max 15 s) for the result.
   * Proves the whole path API → PostgreSQL → worker → PostgreSQL without touching any website.
   */
  router.post('/queue/ping', dbRoute(async (req, res) => {
    const { waitMs } = parse(z.object({ waitMs: z.coerce.number().int().min(0).max(15_000).default(0) }), req.query);
    let job = await enqueueJob({ type: PING_JOB, maxAttempts: 1, priority: 10 });
    const deadline = Date.now() + waitMs;
    while (!TERMINAL.has(job.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      job = (await getPrisma().job.findUnique({ where: { id: job.id } })) ?? job;
    }
    res.status(TERMINAL.has(job.status) ? 200 : 202).json(view(job));
  }));

  return router;
}
