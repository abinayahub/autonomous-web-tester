/**
 * QueueRunner against live PostgreSQL (`npm run test:integration -w @awt/worker`).
 * Test-only handlers on "itest." job types; all rows are deleted afterwards.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { cancelJob, disconnectPrisma, enqueueJob, getPrisma } from '@awt/db';
import { QueueRunner, type HandlerSpec } from './runner.js';

const live = Boolean(process.env.DATABASE_URL?.trim());
const T = `itest.${Date.now()}.runner`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`timed out; last value ${JSON.stringify(v)}`);
    await sleep(100);
  }
}

describe.skipIf(!live)('QueueRunner (live PostgreSQL)', () => {
  const db = live ? getPrisma() : (undefined as never);
  const seen: Array<{ worker: string; id: string }> = [];
  const flakyCalls = new Map<string, number>();
  const handlers: Record<string, HandlerSpec> = {
    [`${T}.work`]: { run: async (job, ctx) => { seen.push({ worker: ctx.workerId, id: job.id }); await sleep(30); return { by: ctx.workerId }; } },
    [`${T}.flaky`]: {
      run: async (job) => {
        const n = (flakyCalls.get(job.id) ?? 0) + 1;
        flakyCalls.set(job.id, n);
        if (n === 1) throw new Error('transient failure');
        return { succeededOnCall: n };
      },
    },
    [`${T}.slow`]: { timeoutMs: 300, run: (_job, ctx) => new Promise((_, reject) => ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason))) },
    [`${T}.long`]: { run: (_job, ctx) => new Promise((resolve) => { const t = setTimeout(resolve, 60_000); ctx.signal.addEventListener('abort', () => clearTimeout(t)); }) },
  };
  const opts = { handlers, concurrency: 3, pollMs: 100, heartbeatMs: 200, leaseMs: 5_000, retryDelayMs: 0, quiet: true };
  const a = new QueueRunner({ ...opts, workerId: `${T}-A` });
  const b = new QueueRunner({ ...opts, workerId: `${T}-B` });

  afterAll(async () => {
    await Promise.all([a.stop(1_000), b.stop(1_000)]);
    await db.job.deleteMany({ where: { type: { startsWith: T } } });
    await db.queueWorker.deleteMany({ where: { id: { startsWith: T } } });
    await disconnectPrisma();
  });

  it('two runners register as live workers', async () => {
    await Promise.all([a.start(), b.start()]);
    const workers = await db.queueWorker.findMany({ where: { id: { startsWith: T } } });
    expect(workers.map((w) => w.id).sort()).toEqual([`${T}-A`, `${T}-B`]);
    expect(workers[0]!.jobTypes).toContain(`${T}.work`);
  });

  it('processes 24 jobs exactly once, shared between both runners', async () => {
    const jobs = await Promise.all(Array.from({ length: 24 }, (_, i) => enqueueJob({ type: `${T}.work`, payload: { i } })));
    const ids = jobs.map((j) => j.id);
    await waitFor(() => db.job.count({ where: { id: { in: ids }, status: 'COMPLETED' } }), (n) => n === 24);
    expect(seen.filter((s) => ids.includes(s.id))).toHaveLength(24); // no job ran twice
    expect(new Set(seen.map((s) => s.worker)).size).toBe(2);
    const sample = await db.job.findUniqueOrThrow({ where: { id: ids[0]! } });
    expect(sample.result).toEqual({ by: seen.find((s) => s.id === ids[0])!.worker });
  });

  it('retries a transient failure automatically and then succeeds', async () => {
    const job = await enqueueJob({ type: `${T}.flaky`, maxAttempts: 3 });
    const done = await waitFor(() => db.job.findUniqueOrThrow({ where: { id: job.id } }), (j) => j.status === 'COMPLETED');
    expect(done).toMatchObject({ attempts: 2, result: { succeededOnCall: 2 }, lastError: null });
  });

  it('times out a stuck attempt and fails it after its last attempt', async () => {
    const job = await enqueueJob({ type: `${T}.slow`, maxAttempts: 2 });
    const done = await waitFor(() => db.job.findUniqueOrThrow({ where: { id: job.id } }), (j) => j.status === 'FAILED');
    expect(done).toMatchObject({ attempts: 2, lastError: 'Job exceeded its time limit' });
  });

  it('aborts a running job when it is cancelled', async () => {
    const job = await enqueueJob({ type: `${T}.long` });
    await waitFor(() => db.job.findUniqueOrThrow({ where: { id: job.id } }), (j) => j.status === 'RUNNING');
    await cancelJob(job.id);
    await waitFor(async () => [...a.runningJobIds, ...b.runningJobIds].includes(job.id), (running) => !running, 5_000);
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('CANCELLED');
  });

  it('on shutdown, hands an unfinished job back to the queue without using an attempt', async () => {
    const job = await enqueueJob({ type: `${T}.long` });
    const running = await waitFor(() => db.job.findUniqueOrThrow({ where: { id: job.id } }), (j) => j.status === 'RUNNING');
    const owner = running.lockedBy === a.workerId ? a : b;
    const other = owner === a ? b : a;
    await other.stop(200); // keep the other runner from picking it up again
    await owner.stop(200);
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'PENDING', attempts: 0, lockedBy: null });
    expect(await db.queueWorker.count({ where: { id: { startsWith: T } } })).toBe(0);
  });
});
