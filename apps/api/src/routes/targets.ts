import { Router } from 'express';
import { z } from 'zod';
import { checkUrlSafety, parseAllowPrivate, type NetworkPolicy } from '@awt/crypto';
import type { AppConfig } from '@awt/shared';
import { HttpError, asyncRoute } from '../http.js';

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 512 * 1024;

const bodySchema = z.object({ url: z.string().trim().min(1) });

export interface TargetCheckResult {
  reachable: boolean;
  requestedUrl: string;
  finalUrl?: string;
  statusCode?: number;
  contentType?: string;
  title?: string;
  responseTimeMs?: number;
  redirects: Array<{ from: string; to: string; statusCode: number }>;
  error?: string;
  checkedAt: string;
}

function parseHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, 'invalid_url', 'Enter a full URL, e.g. https://staging.example.com');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, 'invalid_url', 'Only http and https URLs can be tested.');
  if (u.username || u.password) throw new HttpError(400, 'invalid_url', 'URLs must not contain embedded credentials.');
  return u;
}

async function readTitle(res: Response): Promise<string | undefined> {
  if (!res.body || !/text\/html/i.test(res.headers.get('content-type') ?? '')) return undefined;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const html = Buffer.concat(chunks).toString('utf8');
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 200) || undefined;
}

/** One real HTTP GET (following up to 5 redirects) — a reachability check, not a test result. */
export async function checkTarget(rawUrl: string, policy: NetworkPolicy = {}): Promise<TargetCheckResult> {
  const requested = parseHttpUrl(rawUrl);
  const redirects: TargetCheckResult['redirects'] = [];
  const started = Date.now();
  let current = requested;
  try {
    for (let hop = 0; ; hop++) {
      // SSRF guard on every hop: private, loopback, link-local and metadata addresses are refused.
      const safe = await checkUrlSafety(current.href, policy);
      if (!safe.ok) {
        return { reachable: false, requestedUrl: requested.href, finalUrl: current.href, redirects, responseTimeMs: Date.now() - started, error: `Blocked for safety: ${safe.reason}`, checkedAt: new Date().toISOString() };
      }
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'AutonomousWebTester/0.1 (connectivity check)', accept: 'text/html,*/*;q=0.8' },
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, current);
        redirects.push({ from: current.href, to: next.href, statusCode: res.status });
        await res.body?.cancel().catch(() => undefined);
        if (hop + 1 >= MAX_REDIRECTS) {
          return { reachable: false, requestedUrl: requested.href, finalUrl: next.href, statusCode: res.status, redirects, responseTimeMs: Date.now() - started, error: `Stopped after ${MAX_REDIRECTS} redirects (possible redirect loop)`, checkedAt: new Date().toISOString() };
        }
        current = parseHttpUrl(next.href);
        continue;
      }
      const title = await readTitle(res);
      return {
        reachable: res.status < 500,
        requestedUrl: requested.href,
        finalUrl: current.href,
        statusCode: res.status,
        contentType: res.headers.get('content-type') ?? undefined,
        title,
        responseTimeMs: Date.now() - started,
        redirects,
        checkedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const reason = e.name === 'TimeoutError' ? `No response within ${TIMEOUT_MS / 1000}s` : (e.cause?.code ?? e.cause?.message ?? e.message);
    return { reachable: false, requestedUrl: requested.href, redirects, responseTimeMs: Date.now() - started, error: reason, checkedAt: new Date().toISOString() };
  }
}

export function targetsRouter(config: AppConfig): Router {
  const router = Router();
  const policy = { allowPrivate: parseAllowPrivate(config.ALLOW_PRIVATE_TARGETS) };
  router.post('/targets/check', asyncRoute(async (req, res) => {
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'invalid_url', 'A URL is required.');
    res.json(await checkTarget(parsed.data.url, policy));
  }));
  return router;
}
