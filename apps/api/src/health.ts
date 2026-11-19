import { TEST_RUN_JOB, activeWorkers, checkDatabase, describeDbError, isDatabaseConfigured, queueStats } from '@awt/db';

export interface ServiceStatus {
  ok: boolean;
  /** false = intentionally not set up yet (not counted as a failure). */
  configured: boolean;
  latencyMs?: number;
  error?: string;
}

export interface QueueStatus extends ServiceStatus {
  /** Worker processes that sent a heartbeat in the last 30 s. */
  workers?: number;
  pending?: number;
  running?: number;
}

/**
 * The job queue lives in PostgreSQL. It is "ok" when the database answers and at least one worker
 * is alive — otherwise queued runs would wait forever.
 */
export async function checkQueue(databaseOk: boolean): Promise<QueueStatus> {
  if (!isDatabaseConfigured()) return { ok: false, configured: false, error: 'Needs PostgreSQL (DATABASE_URL is not set)' };
  if (!databaseOk) return { ok: false, configured: true, error: 'PostgreSQL is unavailable' };
  try {
    const [workers, stats] = await Promise.all([activeWorkers(), queueStats()]);
    const testers = workers.filter((w) => w.jobTypes.includes(TEST_RUN_JOB));
    const error = !workers.length
      ? 'No worker is running — start it with `npm run dev:worker`'
      : !testers.length
        ? 'A worker is online but its test browser (Chromium) cannot start — restart the worker (npm run dev). Details are in the worker log.'
        : undefined;
    return {
      ok: testers.length > 0,
      configured: true,
      workers: testers.length,
      pending: stats.counts.PENDING,
      running: stats.counts.RUNNING,
      ...(error ? { error } : {}),
    };
  } catch (err) {
    return { ok: false, configured: true, error: describeDbError(err)?.message ?? (err as Error).message };
  }
}

export async function collectHealth() {
  const database = await checkDatabase();
  const queue = await checkQueue(database.ok);
  const services = { database, queue };
  const failing = Object.entries(services).filter(([, s]) => s.configured && !s.ok).map(([k]) => k);
  const notConfigured = Object.entries(services).filter(([, s]) => !s.configured).map(([k]) => k);
  return {
    status: failing.length ? ('degraded' as const) : ('ok' as const),
    failing,
    notConfigured,
    services,
    timestamp: new Date().toISOString(),
  };
}
