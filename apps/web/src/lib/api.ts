import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly reasons: string[] = [],
    public readonly fields: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
  }

  get isDbNotConfigured() {
    return this.code === 'database_not_configured';
  }
}

const API_DIRECT_HEALTH = `${typeof location !== 'undefined' ? location.protocol : 'http:'}//${typeof location !== 'undefined' ? location.hostname : 'localhost'}:4000/api/health`;

/**
 * Requests go through the web dev server (port 5173), which proxies /api to the API (port 4000).
 * When that hop fails, ask the API directly so the message names the process that is actually down.
 */
async function unreachableError(): Promise<ApiError> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(API_DIRECT_HEALTH, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (r.status === 200 || r.status === 503) {
      return new ApiError(
        0,
        'web_server_unreachable',
        'The web dev server on port 5173 has stopped, but the API on port 4000 is running and your data is safe. Restart it with `npm run dev:web` (or `npm run dev`), then reload this page.',
      );
    }
  } catch {
    /* API did not answer directly either */
  }
  return new ApiError(0, 'api_unreachable', 'The API server is not reachable on port 4000. Start it with `npm run dev:api`.');
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw await unreachableError();
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    // /api/health answers 503 + a full status document when a configured service is down — that is data.
    if (path === '/health' && res.status === 503 && body && typeof body === 'object' && 'services' in body) return body as T;
    const b = (body ?? {}) as { error?: string; message?: string; reasons?: string[]; fields?: Array<{ path: string; message: string }> };
    // Our API always sends a JSON body; a 5xx without one comes from the Vite proxy when the API is down.
    if (res.status >= 500 && body === undefined) {
      throw new ApiError(0, 'api_unreachable', 'The API server is not reachable on port 4000. Start it with `npm run dev:api`.');
    }
    throw new ApiError(res.status, b.error ?? `http_${res.status}`, b.message ?? `Request failed (${res.status})`, b.reasons, b.fields);
  }
  return body as T;
}

export interface Resource<T> {
  data?: T;
  error?: ApiError;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetches a GET endpoint. `pollMs` re-fetches on an interval (used for live run progress);
 * pass `null` as path to skip fetching.
 */
export function useApi<T>(path: string | null, pollMs?: number | ((data: T | undefined) => number | undefined)): Resource<T> {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: path !== null });
  const [tick, setTick] = useState(0);
  const dataRef = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    api<T>(path, { signal: ctrl.signal })
      .then((data) => {
        dataRef.current = data;
        setState({ data, loading: false });
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        dataRef.current = undefined;
        setState({ error: err instanceof ApiError ? err : new ApiError(0, 'unknown', String(err)), loading: false });
      });
    return () => ctrl.abort();
  }, [path, tick]);

  useEffect(() => {
    if (path === null || state.loading) return;
    const ms = typeof pollMs === 'function' ? pollMs(dataRef.current) : pollMs;
    if (!ms) return;
    const t = setTimeout(() => setTick((n) => n + 1), ms);
    return () => clearTimeout(t);
  }, [path, pollMs, state.loading, state.data]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}
