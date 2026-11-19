/**
 * Live PostgreSQL tests for the job queue (`npm run test:integration -w @awt/db`).
 * Uses job types prefixed "itest." and tagged users/projects; everything is deleted in afterAll.
 * No testing results are produced — these jobs carry no website data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DuplicateJobError,
  PermanentJobError,
  cancelJob,
  claimJob,
  completeJob,
  disconnectPrisma,
  enqueueJob,
  enqueueTestRun,
  failJob,
  getPrisma,
  heartbeatJobs,
  recoverStaleJobs,
  releaseJob,
} from './index.js';

const live = Boolean(process.env.DATABASE_URL?.trim());
const T = `itest.${Date.now()}`; // unique job-type prefix for this test run
const type = (s: string) => `${T}.${s}`;
const W1 = `${T}-worker-1`;
const W2 = `${T}-worker-2`;

describe.skipIf(!live)('PostgreSQL job queue', () => {
  const db = live ? getPrisma() : (undefined as never);
  let userId = '';
  let projectId = '';

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `${T}@integration.invalid`, passwordHash: 'x', name: 'Queue integration' } });
    userId = user.id;
    projectId = (await db.project.create({ data: { ownerId: user.id, name: `${T} project`, baseUrl: 'http://localhost:4500' } })).id;
  });

  afterAll(async () => {
    await db.job.deleteMany({ where: { type: { startsWith: T } } });
    await db.user.deleteMany({ where: { email: { startsWith: T } } }).catch(async () => {
      // runs reference the user; delete project (cascades runs → jobs/events) first
      await db.project.deleteMany({ where: { ownerId: userId } });
      await db.user.deleteMany({ where: { email: { startsWith: T } } });
    });
    await disconnectPrisma();
  });

  it('enqueue → claim → complete, tracking status, attempts, owner and timestamps', async () => {
    const job = await enqueueJob({ type: type('basic'), payload: { n: 1 } });
    expect(job.status).toBe('PENDING');
    const claimed = await claimJob(W1, [type('basic')]);
    expect(claimed).toMatchObject({ id: job.id, status: 'RUNNING', attempts: 1, lockedBy: W1 });
    expect(claimed!.startedAt).toBeInstanceOf(Date);
    expect(await claimJob(W2, [type('basic')])).toBeNull(); // nothing left
    expect(await completeJob(job.id, W2)).toBe(false); // not the owner
    expect(await completeJob(job.id, W1, { ok: true })).toBe(true);
    const done = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({ status: 'COMPLETED', result: { ok: true }, lockedBy: null });
    expect(done.finishedAt).toBeInstanceOf(Date);
  });

  it('respects priority and run_at (future jobs are not claimable yet)', async () => {
    const t = type('order');
    const later = await enqueueJob({ type: t, runAt: new Date(Date.now() + 60_000) });
    const low = await enqueueJob({ type: t, priority: 0 });
    const high = await enqueueJob({ type: t, priority: 5 });
    expect((await claimJob(W1, [t]))!.id).toBe(high.id);
    expect((await claimJob(W1, [t]))!.id).toBe(low.id);
    expect(await claimJob(W1, [t])).toBeNull();
    expect((await db.job.findUniqueOrThrow({ where: { id: later.id } })).status).toBe('PENDING');
  });

  it('retries failed jobs with backoff, then marks them FAILED when attempts run out', async () => {
    const t = type('retry');
    const job = await enqueueJob({ type: t, maxAttempts: 3 });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const c = await claimJob(W1, [t]);
      expect(c).toMatchObject({ id: job.id, attempts: attempt });
      const outcome = await failJob(job.id, W1, new Error(`boom ${attempt}`), { retryDelayMs: attempt === 1 ? 60_000 : 0 });
      expect(outcome).toBe(attempt < 3 ? 'PENDING' : 'FAILED');
      if (attempt === 1) {
        // backoff: not claimable until run_at
        expect(await claimJob(W1, [t])).toBeNull();
        await db.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
      }
    }
    const final = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(final).toMatchObject({ status: 'FAILED', attempts: 3, lastError: 'boom 3' });
  });

  it('does not retry permanent errors', async () => {
    const t = type('permanent');
    const job = await enqueueJob({ type: t, maxAttempts: 5 });
    await claimJob(W1, [t]);
    expect(await failJob(job.id, W1, new PermanentJobError('bad input'))).toBe('FAILED');
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(1);
  });

  it('prevents duplicates: 10 concurrent enqueues with one key create exactly one job', async () => {
    const key = `${T}:dedupe`;
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => enqueueJob({ type: type('dedupe'), dedupeKey: key })));
    const created = results.filter((r) => r.status === 'fulfilled');
    const dupes = results.filter((r) => r.status === 'rejected' && r.reason instanceof DuplicateJobError);
    expect(created).toHaveLength(1);
    expect(dupes).toHaveLength(9);
    // Once finished, the key is free again.
    const id = (created[0] as PromiseFulfilledResult<{ id: string }>).value.id;
    await claimJob(W1, [type('dedupe')]);
    await completeJob(id, W1);
    await expect(enqueueJob({ type: type('dedupe'), dedupeKey: key })).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('hands every job to exactly one of 6 concurrent workers (SKIP LOCKED)', async () => {
    const t = type('fanout');
    const jobs = await Promise.all(Array.from({ length: 40 }, (_, i) => enqueueJob({ type: t, payload: { i } })));
    const claimedBy = new Map<string, string>();
    await Promise.all(
      Array.from({ length: 6 }, async (_, w) => {
        const worker = `${T}-w${w}`;
        for (;;) {
          const j = await claimJob(worker, [t]);
          if (!j) break;
          expect(claimedBy.has(j.id)).toBe(false);
          claimedBy.set(j.id, worker);
          await completeJob(j.id, worker);
        }
      }),
    );
    expect(claimedBy.size).toBe(40);
    expect(new Set(claimedBy.values()).size).toBeGreaterThan(1); // work was actually shared
    const states = await db.job.groupBy({ by: ['status', 'attempts'], where: { id: { in: jobs.map((j) => j.id) } }, _count: { _all: true } });
    expect(states).toEqual([{ status: 'COMPLETED', attempts: 1, _count: { _all: 40 } }]);
  });

  it('recovers jobs from a crashed worker (stale heartbeat) and fails them when out of attempts', async () => {
    const t = type('stale');
    const a = await enqueueJob({ type: t, maxAttempts: 2 });
    const b = await enqueueJob({ type: t, maxAttempts: 1 });
    await claimJob(W1, [t]);
    await claimJob(W1, [t]);
    // Simulate a crash: heartbeat stopped 5 minutes ago.
    await db.job.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { heartbeatAt: new Date(Date.now() - 300_000) } });
    const r = await recoverStaleJobs(60_000);
    expect(r.requeued).toBeGreaterThanOrEqual(1);
    expect((await db.job.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('PENDING');
    expect((await db.job.findUniqueOrThrow({ where: { id: b.id } }))).toMatchObject({ status: 'FAILED' });
    expect((await db.job.findUniqueOrThrow({ where: { id: b.id } })).lastError).toMatch(/stopped responding/);
    // The crashed worker can no longer complete it.
    expect(await completeJob(a.id, W1)).toBe(false);
  });

  it('cancels pending jobs immediately and tells the owner of a running job via heartbeat', async () => {
    const t = type('cancel');
    const pending = await enqueueJob({ type: t, runAt: new Date(Date.now() + 60_000) });
    expect((await cancelJob(pending.id))!.status).toBe('CANCELLED');
    const running = await enqueueJob({ type: t });
    await claimJob(W1, [t]);
    expect((await heartbeatJobs(W1, [running.id])).has(running.id)).toBe(true);
    await cancelJob(running.id);
    expect((await heartbeatJobs(W1, [running.id])).has(running.id)).toBe(false);
    expect(await completeJob(running.id, W1)).toBe(false);
  });

  it('releases a job on graceful shutdown without using an attempt', async () => {
    const t = type('release');
    const job = await enqueueJob({ type: t });
    await claimJob(W1, [t]);
    expect(await releaseJob(job.id, W1)).toBe(true);
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'PENDING', attempts: 0, lockedBy: null });
  });

  it('test runs: one active run per project, run status follows the job', async () => {
    const both = await Promise.allSettled([1, 2, 3].map(() => enqueueTestRun({ projectId, startedById: userId, configSnapshot: { modules: [] } })));
    const ok = both.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof enqueueTestRun>>>[];
    expect(ok).toHaveLength(1);
    expect(both.filter((r) => r.status === 'rejected' && r.reason instanceof DuplicateJobError)).toHaveLength(2);
    const { run, job } = ok[0]!.value;
    expect(run.status).toBe('QUEUED');
    expect(job).toMatchObject({ type: 'test-run', runId: run.id, status: 'PENDING' });
    // Move the job under this test's worker and fail it permanently → run FAILED with the reason and an event.
    await db.job.update({ where: { id: job.id }, data: { type: type('test-run') } });
    await claimJob(W1, [type('test-run')]);
    await failJob(job.id, W1, new PermanentJobError('engine missing'));
    const after = await db.testRun.findUniqueOrThrow({ where: { id: run.id }, include: { events: { orderBy: { id: 'asc' } } } });
    expect(after).toMatchObject({ status: 'FAILED', errorMessage: 'engine missing' });
    expect(after.events.map((e) => e.type)).toEqual(['run.queued', 'run.failed']);
    // A new run is allowed now that the previous one finished.
    const next = await enqueueTestRun({ projectId, startedById: userId, configSnapshot: {} });
    await cancelJob(next.job.id, 'test cleanup');
    expect((await db.testRun.findUniqueOrThrow({ where: { id: next.run.id } })).status).toBe('CANCELLED');
  });
});
