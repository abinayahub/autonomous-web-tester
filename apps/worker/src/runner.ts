/**
 * Queue runner: claims jobs from PostgreSQL and executes them with a bounded concurrency.
 * Several runners (in one process or many) can share the queue safely — claiming uses SKIP LOCKED.
 */
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  PermanentJobError,
  claimJob,
  completeJob,
  failJob,
  heartbeatJobs,
  recoverStaleJobs,
  releaseJob,
  registerWorker,
  touchWorker,
  unregisterWorker,
  type Job,
  type Prisma,
} from '@awt/db';

export interface JobContext {
  workerId: string;
  /** Aborted when the job is cancelled, times out, or the worker shuts down. Handlers must stop promptly. */
  signal: AbortSignal;
  log: (message: string) => void;
}
export type JobHandler = (job: Job, ctx: JobContext) => Promise<Prisma.InputJsonValue | void>;

export interface HandlerSpec {
  run: JobHandler;
  /** Hard limit for one attempt. */
  timeoutMs?: number;
}

export interface RunnerOptions {
  handlers: Record<string, HandlerSpec>;
  concurrency?: number;
  pollMs?: number;
  heartbeatMs?: number;
  leaseMs?: number;
  /** Fixed retry delay (tests); default is exponential backoff. */
  retryDelayMs?: number;
  workerId?: string;
  quiet?: boolean;
}

class JobAbort extends Error {
  constructor(public readonly reason: 'cancelled' | 'timeout' | 'shutdown') {
    super(reason === 'cancelled' ? 'Job was cancelled' : reason === 'timeout' ? 'Job exceeded its time limit' : 'Worker shutting down');
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

export class QueueRunner {
  readonly workerId: string;
  private readonly opts: Required<Omit<RunnerOptions, 'retryDelayMs' | 'workerId' | 'quiet'>> & Pick<RunnerOptions, 'retryDelayMs' | 'quiet'>;
  private readonly active = new Map<string, { job: Job; controller: AbortController; done: Promise<void> }>();
  private stopping = new AbortController();
  private loops: Promise<void>[] = [];
  private timers: NodeJS.Timeout[] = [];
  /** Job types this worker temporarily cannot run, with the reason. */
  private readonly paused = new Map<string, string>();

  constructor(options: RunnerOptions) {
    this.workerId = options.workerId ?? `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
    this.opts = {
      handlers: options.handlers,
      concurrency: options.concurrency ?? 2,
      pollMs: options.pollMs ?? 1_000,
      heartbeatMs: options.heartbeatMs ?? 10_000,
      leaseMs: options.leaseMs ?? 60_000,
      retryDelayMs: options.retryDelayMs,
      quiet: options.quiet,
    };
    if (this.opts.heartbeatMs * 3 > this.opts.leaseMs) throw new Error('leaseMs must be at least 3× heartbeatMs');
  }

  private log(msg: string) {
    if (!this.opts.quiet) console.log(`[worker] ${msg}`);
  }

  get types() {
    return Object.keys(this.opts.handlers);
  }
  /** Types this worker will claim right now. */
  get activeTypes() {
    return this.types.filter((t) => !this.paused.has(t));
  }

  /** Stop claiming a job type (other workers can still take it); the registry is updated so the API knows. */
  pause(type: string, reason: string) {
    if (this.paused.has(type)) return;
    this.paused.set(type, reason);
    console.error(`[worker] paused "${type}" jobs: ${reason}`);
    void this.publish();
  }
  resume(type: string) {
    if (!this.paused.delete(type)) return;
    this.log(`resumed "${type}" jobs`);
    void this.publish();
  }
  isPaused(type: string) {
    return this.paused.has(type);
  }
  private async publish() {
    await registerWorker({ id: this.workerId, hostname: hostname(), pid: process.pid, concurrency: this.opts.concurrency, jobTypes: this.activeTypes }).catch(() => undefined);
  }
  get runningJobIds() {
    return [...this.active.keys()];
  }

  async start() {
    await this.publish();
    // Recover jobs left RUNNING by a crashed worker before taking new work.
    await this.recover();
    this.timers.push(setInterval(() => void this.heartbeat(), this.opts.heartbeatMs));
    this.timers.push(setInterval(() => void this.recover(), Math.max(5_000, this.opts.leaseMs / 2)));
    for (let i = 0; i < this.opts.concurrency; i++) this.loops.push(this.loop());
    this.log(`queue runner ${this.workerId} started — concurrency ${this.opts.concurrency}, job types: ${this.types.join(', ')}`);
  }

  /** Stops claiming, aborts running jobs (they are re-queued as a retryable failure) and waits for them. */
  async stop(graceMs = 10_000) {
    if (this.stopping.signal.aborted) return;
    this.stopping.abort();
    this.timers.forEach(clearInterval);
    const pending = [...this.active.values()];
    if (pending.length) this.log(`stopping — waiting up to ${graceMs / 1000} s for ${pending.length} job(s)`);
    const timeout = sleep(graceMs).then(() => pending.forEach((a) => a.controller.abort(new JobAbort('shutdown'))));
    await Promise.race([Promise.all(pending.map((a) => a.done)), timeout]);
    pending.forEach((a) => a.controller.abort(new JobAbort('shutdown')));
    await Promise.all(pending.map((a) => a.done));
    await Promise.all(this.loops);
    await unregisterWorker(this.workerId).catch(() => undefined);
    this.log('queue runner stopped');
  }

  private async loop() {
    while (!this.stopping.signal.aborted) {
      let job: Job | null = null;
      try {
        job = await claimJob(this.workerId, this.activeTypes);
      } catch (err) {
        console.error(`[worker] claim failed: ${(err as Error).message.split('\n').slice(-1)[0]}`);
        await sleep(this.opts.pollMs * 5, this.stopping.signal);
        continue;
      }
      if (!job) {
        await sleep(this.opts.pollMs, this.stopping.signal);
        continue;
      }
      await this.execute(job);
    }
  }

  private async execute(job: Job) {
    const spec = this.opts.handlers[job.type]!;
    const controller = new AbortController();
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    this.active.set(job.id, { job, controller, done });
    const started = Date.now();
    const timer = spec.timeoutMs ? setTimeout(() => controller.abort(new JobAbort('timeout')), spec.timeoutMs) : undefined;
    this.log(`▶ ${job.type} ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
    try {
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason ?? new JobAbort('cancelled')), { once: true });
      });
      const result = await Promise.race([
        spec.run(job, { workerId: this.workerId, signal: controller.signal, log: (m) => this.log(`  ${job.type} ${job.id.slice(0, 8)}: ${m}`) }),
        aborted,
      ]);
      const ok = await completeJob(job.id, this.workerId, (result ?? undefined) as Prisma.InputJsonValue | undefined);
      this.log(ok ? `✔ ${job.type} ${job.id} completed in ${Date.now() - started} ms` : `• ${job.type} ${job.id} finished but was no longer owned (cancelled or reclaimed)`);
    } catch (err) {
      if (err instanceof JobAbort && err.reason === 'cancelled') {
        this.log(`■ ${job.type} ${job.id} cancelled`);
      } else if (err instanceof JobAbort && err.reason === 'shutdown') {
        const released = await releaseJob(job.id, this.workerId).catch(() => false);
        this.log(`↩ ${job.type} ${job.id} ${released ? 'released back to the queue (attempt not counted)' : 'was not owned at shutdown'}`);
      } else {
        const outcome = await failJob(job.id, this.workerId, err, { retryable: !(err instanceof PermanentJobError), retryDelayMs: this.opts.retryDelayMs }).catch((e) => {
          console.error(`[worker] could not record failure of ${job.id}: ${(e as Error).message}`);
          return null;
        });
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`✖ ${job.type} ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}): ${msg} → ${outcome === 'PENDING' ? 'will retry' : outcome === 'FAILED' ? 'FAILED' : 'not owned'}`);
      }
    } finally {
      clearTimeout(timer);
      this.active.delete(job.id);
      finish();
    }
  }

  private async heartbeat() {
    try {
      await touchWorker(this.workerId);
      const ids = this.runningJobIds;
      if (!ids.length) return;
      const owned = await heartbeatJobs(this.workerId, ids);
      for (const id of ids) {
        // Status changed under us: cancelled by a user, or reclaimed after a long stall. Stop working on it.
        if (!owned.has(id)) this.active.get(id)?.controller.abort(new JobAbort('cancelled'));
      }
    } catch (err) {
      console.error(`[worker] heartbeat failed: ${(err as Error).message.split('\n').slice(-1)[0]}`);
    }
  }

  private async recover() {
    try {
      const r = await recoverStaleJobs(this.opts.leaseMs);
      if (r.requeued || r.failed) this.log(`recovered stale jobs: ${r.requeued} re-queued, ${r.failed} failed (no attempts left)`);
    } catch (err) {
      console.error(`[worker] stale-job recovery failed: ${(err as Error).message.split('\n').slice(-1)[0]}`);
    }
  }
}

