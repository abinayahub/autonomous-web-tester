import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { DuplicateJobError, describeDbError, isDatabaseConfigured } from '@awt/db';

/** Uniform JSON error shape consumed by the dashboard: { error: code, message, reasons? }. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const DB_NOT_CONFIGURED = () =>
  new HttpError(
    503,
    'database_not_configured',
    'PostgreSQL is not configured (DATABASE_URL is not set). Projects, runs, issues and reports are stored there.',
  );

/** Wraps an async handler so rejections reach the error middleware (and require a database). */
export function dbRoute(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    if (!isDatabaseConfigured()) return next(DB_NOT_CONFIGURED());
    handler(req, res).catch(next);
  };
}

export function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/**
 * Final error handler. Never echoes request bodies (they may contain test credentials)
 * and never leaks stack traces to the client.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
    return;
  }
  if (err instanceof DuplicateJobError) {
    // Duplicate test execution prevented: point the client at the run/job that is already active.
    res.status(409).json({ error: 'already_active', message: err.message, jobId: err.existing.id, runId: err.existing.runId, status: err.existing.status });
    return;
  }
  const e = err as { type?: string; status?: number; name?: string; message?: string };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON.' });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large', message: 'Request body is too large.' });
    return;
  }
  const db = describeDbError(err);
  if (db) {
    // Server log gets the technical detail; the client gets a stable code and a safe message.
    const log = db.status >= 500 ? console.error : console.warn;
    log(`[api] ${req.method} ${req.path} → ${db.status} ${db.code}: ${db.detail ?? db.message}`);
    res.status(db.status).json({ error: db.code, message: db.message });
    return;
  }
  console.error(`[api] ${req.method} ${req.path} → 500 unhandled error:`, e?.message ?? err);
  res.status(500).json({ error: 'internal_error', message: 'Unexpected server error.' });
}
