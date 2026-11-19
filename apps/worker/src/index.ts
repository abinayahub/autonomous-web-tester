/**
 * Test worker: consumes the PostgreSQL-backed job queue (no Redis).
 * Run several worker processes for more throughput — claiming is safe across processes.
 */
import { launchChromium } from '@awt/engine';
import { TEST_RUN_JOB } from '@awt/db';
import { ConfigError, loadConfig, resolveStorageDir } from '@awt/shared';
import { createKeyRing, parseAllowPrivate } from '@awt/crypto';
import { disconnectPrisma, logDatabaseStatus } from '@awt/db';
import { createHandlers } from './handlers.js';
import { QueueRunner } from './runner.js';

// A closed stdout/stderr (e.g. the log collector stopped) must not kill a worker in the middle of a test run.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE' && err.code !== 'ERR_STREAM_DESTROYED') throw err;
  });
}

// A stray rejection (e.g. from a browser page that closed mid-check) is logged with its stack but must not kill
// the worker and every test run it is executing. Synchronous uncaught exceptions still crash it visibly.
process.on('unhandledRejection', (reason) => {
  console.error('[worker] UNHANDLED PROMISE REJECTION (worker keeps running):', reason);
});

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[worker] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const dbOk = await logDatabaseStatus('[worker]');

  const browserCheck = async () => {
    const browser = await launchChromium();
    const v = browser.version();
    await browser.close();
    return v;
  };
  let browserError: string | undefined;
  try {
    console.log(`[worker] playwright chromium ok (v${await browserCheck()})`);
  } catch (err) {
    browserError = (err as Error).message;
    console.error(`[worker] ${browserError}`);
  }

  if (!dbOk) {
    // The queue lives in PostgreSQL; without it there is nothing to consume. Stay up so `npm run dev` keeps running.
    console.log('[worker] idle — the job queue needs PostgreSQL (set DATABASE_URL and run `npm run db:deploy`)');
    const keepAlive = setInterval(() => undefined, 1 << 30);
    const stop = async () => { clearInterval(keepAlive); await disconnectPrisma(); process.exit(0); };
    process.on('SIGINT', () => void stop());
    process.on('SIGTERM', () => void stop());
    return;
  }

  const allowPrivate = parseAllowPrivate(config.ALLOW_PRIVATE_TARGETS);
  if (allowPrivate.length) console.log(`[worker] private targets allowed (development): ${allowPrivate.join(', ')}`);
  let runner!: QueueRunner;
  let recheck: NodeJS.Timeout | undefined;
  const onBrowserFailure = (e: Error) => {
    runner.pause(TEST_RUN_JOB, e.message);
    recheck ??= setInterval(async () => {
      try {
        await browserCheck();
        runner.resume(TEST_RUN_JOB);
        clearInterval(recheck);
        recheck = undefined;
      } catch {
        /* still broken — stay paused */
      }
    }, 60_000);
  };
  runner = new QueueRunner({
    handlers: createHandlers({
      onBrowserFailure,
      storageRoot: resolveStorageDir(config.STORAGE_LOCAL_DIR),
      keyRing: createKeyRing(config.CREDENTIAL_KEY_VERSION, { [config.CREDENTIAL_KEY_VERSION]: config.CREDENTIAL_MASTER_KEY }),
      allowPrivate,
    }),
    concurrency: config.WORKER_CONCURRENCY,
    pollMs: config.QUEUE_POLL_MS,
    leaseMs: config.QUEUE_LEASE_MS,
    heartbeatMs: Math.min(10_000, Math.floor(config.QUEUE_LEASE_MS / 4)),
  });
  await runner.start();
  if (browserError) onBrowserFailure(new Error(browserError));

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received`);
    await runner.stop();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
}

void main().catch(async (err) => {
  console.error('[worker] fatal:', err instanceof Error ? err.message : err);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
