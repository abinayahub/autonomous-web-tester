/**
 * PostgreSQL-backed job queue (no Redis).
 *
 * - Claiming:   UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) — each job goes to exactly one worker,
 *               no matter how many workers poll at once.
 * - Dedupe:     per-key transaction-scoped advisory lock + "is one already PENDING/RUNNING?" check, so two concurrent
 *               requests can never both enqueue the same key (e.g. two runs of one project).
 * - Retries:    failures go back to PENDING with exponential backoff until max_attempts, then FAILED.
 * - Crashes:    RUNNING jobs whose heartbeat is older than the lease are reclaimed (or failed when out of attempts).
 * - Cancel:     PENDING jobs cancel immediately; RUNNING jobs are flagged and the owning worker aborts on its next heartbeat.
 *
 * All timestamps are compared in UTC (Prisma stores TIMESTAMP(3) as UTC; the server's time zone may differ).
 */
import type { Job, Prisma, PrismaClient } from '@prisma/client';
import { getPrisma } from './index.js';

type Db = PrismaClient | Prisma.TransactionClient;

export const ACTIVE_JOB_STATUSES = ['PENDING', 'RUNNING'] as const;

/** Thrown by enqueue when a PENDING/RUNNING job with the same dedupe key exists. */
export class DuplicateJobError extends Error {
  constructor(public readonly existing: Pick<Job, 'id' | 'type' | 'status' | 'runId'>) {
    super(`A ${existing.type} job for this target is already ${existing.status.toLowerCase()} (${existing.id})`);
    this.name = 'DuplicateJobError';
  }
}

/** A failure that retrying cannot fix (bad input, missing engine, target refused). Fails the job immediately. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export interface EnqueueOptions {
  type: string;
  payload?: Prisma.InputJsonValue;
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
  dedupeKey?: string;
  runId?: string;
}

async function withTx<T>(db: Db | undefined, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  // Already inside a transaction (no $transaction on a TransactionClient)? Reuse it so callers can enqueue atomically.
  if (db && !('$transaction' in db)) return fn(db);
  return ((db as PrismaClient | undefined) ?? getPrisma()).$transaction(fn);
}

async function lockKey(tx: Prisma.TransactionClient, key: string) {
  // hashtextextended → 64-bit lock id; released automatically at commit/rollback.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Adds a job. With `dedupeKey`, throws DuplicateJobError if an active job with that key exists. */
export async function enqueueJob(opts: EnqueueOptions, db?: Db): Promise<Job> {
  return withTx(db, async (tx) => {
    if (opts.dedupeKey) {
      await lockKey(tx, opts.dedupeKey);
      const existing = await tx.job.findFirst({
        where: { dedupeKey: opts.dedupeKey, status: { in: [...ACTIVE_JOB_STATUSES] } },
        select: { id: true, type: true, status: true, runId: true },
      });
      if (existing) throw new DuplicateJobError(existing);
    }
    return tx.job.create({
      data: {
        type: opts.type,
        payload: opts.payload ?? {},
        priority: opts.priority ?? 0,
        maxAttempts: Math.max(1, opts.maxAttempts ?? 3),
        runAt: opts.runAt ?? new Date(),
        dedupeKey: opts.dedupeKey,
        runId: opts.runId,
      },
    });
  });
}

/** Atomically claims the next due job of the given types for this worker, or returns null. */
export async function claimJob(workerId: string, types: string[], db: PrismaClient = getPrisma()): Promise<Job | null> {
  if (!types.length) return null;
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE jobs
       SET status = 'RUNNING', locked_by = ${workerId},
           locked_at = (now() AT TIME ZONE 'UTC'), heartbeat_at = (now() AT TIME ZONE 'UTC'),
           started_at = COALESCE(started_at, now() AT TIME ZONE 'UTC'),
           attempts = attempts + 1, updated_at = (now() AT TIME ZONE 'UTC')
     WHERE id = (
       SELECT id FROM jobs
        WHERE status = 'PENDING' AND run_at <= (now() AT TIME ZONE 'UTC') AND type = ANY(${types}::text[])
        ORDER BY priority DESC, run_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1)
    RETURNING id`;
  const id = rows[0]?.id;
  return id ? db.job.findUnique({ where: { id } }) : null;
}

/** Marks a job COMPLETED. Returns false if this worker no longer owns it (reclaimed or cancelled). */
export async function completeJob(id: string, workerId: string, result?: Prisma.InputJsonValue, db: PrismaClient = getPrisma()): Promise<boolean> {
  const r = await db.job.updateMany({
    where: { id, lockedBy: workerId, status: 'RUNNING' },
    data: { status: 'COMPLETED', result: result ?? undefined, finishedAt: new Date(), lockedBy: null, lastError: null },
  });
  return r.count === 1;
}

/** Retry delay after the n-th failed attempt: 5s, 10s, 20s … capped at 5 min, ±20% jitter. */
export function retryDelayMs(attempt: number, baseMs = 5_000, maxMs = 300_000): number {
  const d = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(d * (0.8 + Math.random() * 0.4));
}

const clip = (s: string) => (s.length > 2000 ? `${s.slice(0, 1997)}...` : s);

/**
 * User-facing failure text: Playwright appends browser logs, call logs and command lines to its errors.
 * Those belong in the worker log, not in the run's error message shown in the app.
 */
export function cleanErrorMessage(raw: string): string {
  const cut = raw.split(/\n\s*(?:Browser logs:|Call log:|=+ logs =+)/)[0] ?? raw;
  return clip(cut.trim().replace(/\s+\n/g, '\n'));
}

export interface FailOptions {
  retryable?: boolean;
  /** Override the backoff (tests). */
  retryDelayMs?: number;
}

/**
 * Records a failed attempt. Retries (back to PENDING with backoff) while attempts remain and the error is retryable;
 * otherwise marks the job FAILED and, for test-run jobs, the linked run FAILED too.
 * Returns the resulting status, or null if this worker no longer owned the job.
 */
export async function failJob(id: string, workerId: string, error: unknown, opts: FailOptions = {}, db: PrismaClient = getPrisma()): Promise<'PENDING' | 'FAILED' | null> {
  const message = cleanErrorMessage(error instanceof Error ? error.message : String(error));
  const retryable = opts.retryable ?? !(error instanceof PermanentJobError);
  return db.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id, lockedBy: workerId, status: 'RUNNING' } });
    if (!job) return null;
    if (retryable && job.attempts < job.maxAttempts) {
      const delay = opts.retryDelayMs ?? retryDelayMs(job.attempts);
      await tx.job.update({ where: { id }, data: { status: 'PENDING', lockedBy: null, lockedAt: null, heartbeatAt: null, lastError: message, runAt: new Date(Date.now() + delay) } });
      if (job.runId) {
        await tx.testRun.updateMany({ where: { id: job.runId, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'QUEUED' } });
        await tx.runEvent.create({ data: { runId: job.runId, level: 'WARN', type: 'job.retry', message: `Attempt ${job.attempts} of ${job.maxAttempts} failed: ${message} — retrying in ${Math.round(delay / 1000)} s` } });
      }
      return 'PENDING';
    }
    await tx.job.update({ where: { id }, data: { status: 'FAILED', lockedBy: null, lastError: message, finishedAt: new Date() } });
    if (job.runId) await failRun(tx, job.runId, message, job.attempts);
    return 'FAILED';
  });
}

async function failRun(tx: Prisma.TransactionClient, runId: string, message: string, attempts: number) {
  const r = await tx.testRun.updateMany({
    where: { id: runId, status: { in: ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'] } },
    data: { status: 'FAILED', errorMessage: message, finishedAt: new Date() },
  });
  if (r.count) await tx.runEvent.create({ data: { runId, level: 'ERROR', type: 'run.failed', message: `Run failed after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${message}` } });
}

/** Hands a job back without counting the attempt (graceful worker shutdown). */
export async function releaseJob(id: string, workerId: string, db: PrismaClient = getPrisma()): Promise<boolean> {
  const r = await db.job.updateMany({
    where: { id, lockedBy: workerId, status: 'RUNNING' },
    data: { status: 'PENDING', lockedBy: null, lockedAt: null, heartbeatAt: null, attempts: { decrement: 1 }, runAt: new Date(), lastError: 'Released: worker shut down before finishing' },
  });
  const job = r.count ? await db.job.findUnique({ where: { id }, select: { runId: true } }) : null;
  if (job?.runId) await db.testRun.updateMany({ where: { id: job.runId, status: 'RUNNING' }, data: { status: 'QUEUED' } });
  return r.count === 1;
}

/** Refreshes the lease on this worker's running jobs. Returns the ids it still owns (others were cancelled/reclaimed). */
export async function heartbeatJobs(workerId: string, ids: string[], db: PrismaClient = getPrisma()): Promise<Set<string>> {
  if (!ids.length) return new Set();
  await db.job.updateMany({ where: { id: { in: ids }, lockedBy: workerId, status: 'RUNNING' }, data: { heartbeatAt: new Date() } });
  const owned = await db.job.findMany({ where: { id: { in: ids }, lockedBy: workerId, status: 'RUNNING' }, select: { id: true } });
  return new Set(owned.map((j) => j.id));
}

/**
 * Reclaims RUNNING jobs whose worker stopped heart-beating for longer than `leaseMs` (crash, kill, network loss).
 * They return to PENDING if attempts remain, otherwise FAILED. Safe to call from every worker concurrently.
 */
export async function recoverStaleJobs(leaseMs: number, db: PrismaClient = getPrisma()): Promise<{ requeued: number; failed: number }> {
  const seconds = leaseMs / 1000;
  const stale = await db.$queryRaw<Array<{ id: string; status: string; run_id: string | null; attempts: number }>>`
    UPDATE jobs
       SET status = CASE WHEN attempts < max_attempts THEN 'PENDING'::"JobStatus" ELSE 'FAILED'::"JobStatus" END,
           locked_by = NULL, locked_at = NULL, heartbeat_at = NULL,
           last_error = 'Worker stopped responding (no heartbeat for ' || ${seconds}::int || ' s)',
           finished_at = CASE WHEN attempts < max_attempts THEN NULL ELSE (now() AT TIME ZONE 'UTC') END,
           updated_at = (now() AT TIME ZONE 'UTC')
     WHERE id IN (
       SELECT id FROM jobs
        WHERE status = 'RUNNING' AND heartbeat_at < (now() AT TIME ZONE 'UTC') - make_interval(secs => ${seconds}::double precision)
        FOR UPDATE SKIP LOCKED)
    RETURNING id, status::text AS status, run_id, attempts`;
  for (const j of stale) {
    if (!j.run_id) continue;
    if (j.status === 'FAILED') await db.$transaction((tx) => failRun(tx, j.run_id!, `Worker stopped responding (no heartbeat for ${seconds} s)`, j.attempts));
    else {
      await db.testRun.updateMany({ where: { id: j.run_id, status: 'RUNNING' }, data: { status: 'QUEUED' } });
      await db.runEvent.create({ data: { runId: j.run_id, level: 'WARN', type: 'job.recovered', message: `Worker stopped responding — run re-queued (attempt ${j.attempts} used)` } });
    }
  }
  return { requeued: stale.filter((j) => j.status === 'PENDING').length, failed: stale.filter((j) => j.status === 'FAILED').length };
}

/** Cancels a PENDING or RUNNING job. A running job's worker sees the change on its next heartbeat and aborts. */
export async function cancelJob(id: string, reason = 'Cancelled by user', db: PrismaClient = getPrisma()): Promise<Job | null> {
  return db.$transaction(async (tx) => {
    const r = await tx.job.updateMany({ where: { id, status: { in: [...ACTIVE_JOB_STATUSES] } }, data: { status: 'CANCELLED', lastError: reason, finishedAt: new Date(), lockedBy: null } });
    const job = await tx.job.findUnique({ where: { id } });
    if (r.count && job?.runId) {
      const run = await tx.testRun.updateMany({ where: { id: job.runId, status: { in: ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'] } }, data: { status: 'CANCELLED', finishedAt: new Date(), errorMessage: reason } });
      if (run.count) await tx.runEvent.create({ data: { runId: job.runId, level: 'WARN', type: 'run.cancelled', message: reason } });
    }
    return job;
  });
}

// ── Test runs ───────────────────────────────────────────────────

export const TEST_RUN_JOB = 'test-run';
/** Diagnostic job: proves API → PostgreSQL → worker → PostgreSQL. */
export const PING_JOB = 'system.ping';
export const testRunDedupeKey = (projectId: string) => `${TEST_RUN_JOB}:project:${projectId}`;

/**
 * Creates a TestRun and its queue job in one transaction. Only one active run per project:
 * a second request while one is queued or running throws DuplicateJobError (→ HTTP 409).
 */
export async function enqueueTestRun(input: { projectId: string; startedById: string; configSnapshot: Prisma.InputJsonValue; maxAttempts?: number }, db: PrismaClient = getPrisma()) {
  return db.$transaction(async (tx) => {
    const key = testRunDedupeKey(input.projectId);
    await lockKey(tx, key);
    const active = await tx.testRun.findFirst({ where: { projectId: input.projectId, status: { in: ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'] } }, select: { id: true, status: true } });
    if (active) {
      const job = await tx.job.findFirst({ where: { runId: active.id }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, status: true, runId: true } });
      throw new DuplicateJobError(job ?? { id: active.id, type: TEST_RUN_JOB, status: active.status === 'QUEUED' ? 'PENDING' : 'RUNNING', runId: active.id });
    }
    const run = await tx.testRun.create({ data: { projectId: input.projectId, startedById: input.startedById, configSnapshot: input.configSnapshot } });
    await tx.runEvent.create({ data: { runId: run.id, type: 'run.queued', message: 'Run queued — waiting for a worker' } });
    // Same lock is already held, so enqueueJob's own dedupe check runs inside this transaction.
    const job = await enqueueJob({ type: TEST_RUN_JOB, payload: { runId: run.id }, dedupeKey: key, runId: run.id, maxAttempts: input.maxAttempts ?? 2 }, tx);
    return { run, job };
  });
}

// ── Worker registry & stats ─────────────────────────────────────

export async function registerWorker(w: { id: string; hostname: string; pid: number; concurrency: number; jobTypes: string[] }, db: PrismaClient = getPrisma()) {
  await db.queueWorker.upsert({ where: { id: w.id }, create: w, update: { ...w, lastSeenAt: new Date() } });
}
export async function touchWorker(id: string, db: PrismaClient = getPrisma()) {
  await db.queueWorker.updateMany({ where: { id }, data: { lastSeenAt: new Date() } });
}
export async function unregisterWorker(id: string, db: PrismaClient = getPrisma()) {
  await db.queueWorker.deleteMany({ where: { id } });
}
/** Workers seen within `withinMs`. Older rows (crashed workers) are pruned. */
export async function activeWorkers(withinMs = 30_000, db: PrismaClient = getPrisma()) {
  const cutoff = new Date(Date.now() - withinMs);
  await db.queueWorker.deleteMany({ where: { lastSeenAt: { lt: new Date(Date.now() - 10 * withinMs) } } });
  return db.queueWorker.findMany({ where: { lastSeenAt: { gte: cutoff } }, orderBy: { startedAt: 'asc' } });
}

export async function queueStats(db: PrismaClient = getPrisma()) {
  const groups = await db.job.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = { PENDING: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0, CANCELLED: 0 } as Record<Job['status'], number>;
  for (const g of groups) counts[g.status] = g._count._all;
  const oldestPending = await db.job.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
  return { counts, oldestPendingAt: oldestPending?.createdAt ?? null };
}
