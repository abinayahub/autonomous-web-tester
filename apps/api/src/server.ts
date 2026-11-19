import { ConfigError, loadConfig } from '@awt/shared';
import { disconnectPrisma, logDatabaseStatus } from '@awt/db';
import { createApp } from './app.js';

// A closed stdout/stderr (terminal closed, log collector stopped) must not crash the API on its next console.log.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE' && err.code !== 'ERR_STREAM_DESTROYED') throw err;
  });
}

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`[api] ${err.message}\nSee .env.example.`);
    process.exit(1);
  }
  throw err;
}

const app = createApp(config);

const server = app.listen(config.API_PORT, () => {
  console.log(`[api] listening on http://localhost:${config.API_PORT} (pid ${process.pid})`);
  void logDatabaseStatus('[api]');
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[api] FATAL: port ${config.API_PORT} is already in use by another process. Stop it (or an old dev stack) and start again.`);
  } else {
    console.error('[api] FATAL: HTTP server error:', err);
  }
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(reason: string, exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${reason} — shutting down`);
  // Never hang on shutdown: open keep-alive/streaming connections get 10 s, then the process exits regardless.
  const force = setTimeout(() => {
    console.error('[api] shutdown timed out after 10 s, exiting');
    process.exit(exitCode || 1);
  }, 10_000);
  force.unref();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });
  await disconnectPrisma().catch((err) => console.error('[api] database disconnect failed:', err));
  process.exit(exitCode);
}
process.on('SIGINT', () => void shutdown('SIGINT received', 0));
process.on('SIGTERM', () => void shutdown('SIGTERM received', 0));

// Stray promise rejections are logged loudly with their stack but do not take the API down —
// request errors already go through the error middleware, so these are background bugs, not corrupted state.
process.on('unhandledRejection', (reason) => {
  console.error('[api] UNHANDLED PROMISE REJECTION (API keeps running):', reason);
});
// A synchronous exception outside a request leaves the process in an unknown state: log it and exit visibly.
process.on('uncaughtException', (err, origin) => {
  console.error(`[api] FATAL ${origin}:`, err);
  void shutdown('fatal error', 1);
});
