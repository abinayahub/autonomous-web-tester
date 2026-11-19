import { PrismaClient } from '@prisma/client';
import { describeDbError, redactDatabaseUrl } from './errors.js';

export * from '@prisma/client';
export { describeDbError, redactDatabaseUrl, type DbErrorInfo } from './errors.js';
export * from './queue.js';

let client: PrismaClient | undefined;

/** Lazily-created singleton Prisma client. Warnings (and errors, in development) are logged with a [db] prefix. */
export function getPrisma(): PrismaClient {
  if (!client) {
    const c = new PrismaClient({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    c.$on('warn', (e) => console.warn(`[db] warn: ${e.message}`));
    // Errors are also thrown to the caller (which logs them with context), so only echo them in development.
    c.$on('error', (e) => {
      if (process.env.NODE_ENV === 'development') console.error(`[db] error: ${e.message.split('\n').slice(-1)[0]}`);
    });
    client = c;
  }
  return client;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function checkDatabase(): Promise<{ ok: boolean; configured: boolean; latencyMs?: number; error?: string }> {
  if (!isDatabaseConfigured()) {
    return { ok: false, configured: false, error: 'Not configured (DATABASE_URL is not set)' };
  }
  const started = Date.now();
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return { ok: true, configured: true, latencyMs: Date.now() - started };
  } catch (err) {
    const info = describeDbError(err);
    return { ok: false, configured: true, error: info?.message ?? (err instanceof Error ? err.message.split('\n').slice(-1)[0] : String(err)) };
  }
}

/** One-line startup log: target (password redacted), latency and migration state. */
export async function logDatabaseStatus(prefix: string): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    console.log(`${prefix} database not configured (DATABASE_URL unset)`);
    return false;
  }
  const target = redactDatabaseUrl(process.env.DATABASE_URL);
  const r = await checkDatabase();
  if (!r.ok) {
    console.error(`${prefix} database connection FAILED (${target}): ${r.error}`);
    return false;
  }
  let migrations = '';
  try {
    const rows = await getPrisma().$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    migrations = `, ${rows[0]?.n ?? 0} migration(s) applied`;
  } catch {
    migrations = ', migrations NOT applied — run `npm run db:deploy`';
  }
  console.log(`${prefix} database connected (${target}) in ${r.latencyMs} ms${migrations}`);
  return true;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
