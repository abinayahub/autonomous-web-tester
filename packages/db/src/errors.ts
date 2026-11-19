import { Prisma } from '@prisma/client';

/** HTTP-ready description of a database error. `detail` is for server logs only — never send it to clients. */
export interface DbErrorInfo {
  status: number;
  code: string;
  message: string;
  detail?: string;
}

const lastLine = (m: string) => m.trim().split('\n').filter(Boolean).slice(-1)[0] ?? m;

/**
 * Maps Prisma errors to stable API errors. Returns undefined for anything that is not a Prisma error.
 * Constraint errors are client problems (409 / 400 / 404); connection problems are 503; the rest is 500.
 */
export function describeDbError(err: unknown): DbErrorInfo | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (err.meta ?? {}) as Record<string, unknown>;
    switch (err.code) {
      case 'P2002':
        return { status: 409, code: 'conflict', message: 'A record with the same unique value already exists.', detail: `P2002 unique constraint on ${JSON.stringify(meta.target ?? meta.modelName ?? '?')}` };
      case 'P2003':
        return { status: 400, code: 'invalid_reference', message: 'A referenced record does not exist.', detail: `P2003 foreign key ${String(meta.field_name ?? meta.constraint ?? '?')}` };
      case 'P2025':
        return { status: 404, code: 'not_found', message: 'The requested record was not found.', detail: `P2025 ${String(meta.cause ?? '')}` };
      case 'P2000':
        return { status: 400, code: 'value_too_long', message: 'A value is too long for its field.', detail: `P2000 ${String(meta.column_name ?? '')}` };
      case 'P1001':
      case 'P1002':
      case 'P1017':
        return { status: 503, code: 'database_unavailable', message: 'The database is not reachable. Check that PostgreSQL is running.', detail: `${err.code} ${lastLine(err.message)}` };
      case 'P2021':
      case 'P2022':
        return { status: 503, code: 'database_schema_outdated', message: 'The database schema is out of date. Run `npm run db:deploy`.', detail: `${err.code} ${lastLine(err.message)}` };
      default:
        return { status: 500, code: 'database_error', message: 'The database rejected the request.', detail: `${err.code} ${lastLine(err.message)}` };
    }
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    const auth = err.errorCode === 'P1000';
    return {
      status: 503,
      code: 'database_unavailable',
      message: auth ? 'The database rejected the credentials in DATABASE_URL.' : 'The database could not be reached. Check that PostgreSQL is running and DATABASE_URL is correct.',
      detail: `${err.errorCode ?? 'init'} ${lastLine(err.message)}`,
    };
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    // A malformed query is a server bug, not a client error.
    return { status: 500, code: 'database_query_invalid', message: 'Unexpected server error.', detail: lastLine(err.message) };
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Prisma.PrismaClientRustPanicError) {
    return { status: 503, code: 'database_unavailable', message: 'The database could not be queried.', detail: lastLine(err.message) };
  }
  return undefined;
}

/** Removes the password from a connection string before it is logged. */
export function redactDatabaseUrl(url: string | undefined): string {
  if (!url) return '(not set)';
  return url.replace(/(\/\/[^:/@]+):[^@]*@/, '$1:***@');
}
