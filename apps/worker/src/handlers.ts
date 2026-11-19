import { hostname } from 'node:os';
import { BrowserLaunchError, ENGINE_READY, TargetError, executeTestRun } from '@awt/engine';
import { PING_JOB, PermanentJobError, TEST_RUN_JOB, getPrisma } from '@awt/db';
import type { KeyRing } from '@awt/crypto';
import type { HandlerSpec } from './runner.js';

export interface HandlerDeps {
  storageRoot: string;
  keyRing?: KeyRing;
  allowPrivate: string[];
  /** Called when Chromium cannot start in this worker process. */
  onBrowserFailure?: (e: BrowserLaunchError) => void;
}

/** Real job handlers. No handler fabricates testing results. */
export function createHandlers(deps: HandlerDeps): Record<string, HandlerSpec> {
  return {
    /** Queue diagnostic: proves API → PostgreSQL → worker → PostgreSQL round-trips. Returns facts about the worker only. */
    [PING_JOB]: {
      timeoutMs: 10_000,
      run: async (job, ctx) => ({
        workerId: ctx.workerId,
        hostname: hostname(),
        pid: process.pid,
        queuedForMs: Date.now() - job.createdAt.getTime(),
        processedAt: new Date().toISOString(),
      }),
    },

    /** Executes one test run with the Playwright engine. */
    [TEST_RUN_JOB]: {
      timeoutMs: 45 * 60_000,
      run: async (job, ctx) => {
        const db = getPrisma();
        const runId = (job.payload as { runId?: string } | null)?.runId ?? job.runId;
        if (!runId) throw new PermanentJobError('Job has no runId');
        const run = await db.testRun.findUnique({ where: { id: runId }, select: { id: true, status: true, startedAt: true, project: { select: { name: true, baseUrl: true } } } });
        if (!run) throw new PermanentJobError(`Run ${runId} no longer exists`);
        if (run.status === 'CANCELLED' || run.status === 'COMPLETED' || run.status === 'FAILED') {
          ctx.log(`run already ${run.status.toLowerCase()} — nothing to do`);
          return { skipped: true, runStatus: run.status };
        }
        await db.testRun.update({ where: { id: runId }, data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date() } });
        await db.runEvent.create({ data: { runId, type: 'run.started', message: `Worker ${ctx.workerId} started the run (attempt ${job.attempts} of ${job.maxAttempts}) for ${run.project.baseUrl}` } });
        ctx.log(`run ${runId} for ${run.project.baseUrl}`);
        if (!ENGINE_READY) throw new PermanentJobError('The test execution engine is not installed yet — no tests were executed.');

        try {
          const summary = await executeTestRun(db, {
            runId, signal: ctx.signal, log: ctx.log, storageRoot: deps.storageRoot, keyRing: deps.keyRing, allowPrivate: deps.allowPrivate,
            timeLimitMs: 40 * 60_000,
          });
          return { ...summary };
        } catch (e) {
          if (e instanceof TargetError) throw new PermanentJobError(e.message);
          if (e instanceof BrowserLaunchError) {
            // Full Chromium log in the worker log; the run fails with the readable reason (retrying here would fail again).
            console.error(`[worker] Chromium failed to start for run ${runId}:\n${e.details}`);
            deps.onBrowserFailure?.(e);
            throw new PermanentJobError(e.message);
          }
          throw e;
        }
      },
    },
  };
}
