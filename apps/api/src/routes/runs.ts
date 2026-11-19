import { Router } from 'express';
import { z } from 'zod';
import { checkUrlSafety, createKeyRing, credentialAad, encryptSecret, isUrlAllowed, parseAllowPrivate } from '@awt/crypto';
import { enqueueTestRun, getPrisma } from '@awt/db';
import { EnvironmentType, TestModule, type AppConfig } from '@awt/shared';
import { collectHealth } from '../health.js';
import { HttpError, asyncRoute } from '../http.js';
import { checkTarget } from './targets.js';

/** The Playwright engine and the PostgreSQL queue are both in place. */
export const ENGINE_AVAILABLE = true;

const httpUrl = z
  .string()
  .trim()
  .url('must be a valid URL')
  .refine((u) => /^https?:$/.test(new URL(u).protocol), 'must use http or https')
  .refine((u) => !new URL(u).username && !new URL(u).password, 'must not contain embedded credentials');

const credentialSchema = z.object({
  roleName: z.string().trim().min(1, 'is required').max(50).regex(/^[\w .-]+$/, 'may only contain letters, numbers, spaces, . _ -'),
  username: z.string().trim().min(1, 'is required').max(200),
  password: z.string().min(1, 'is required').max(500),
  loginUrl: httpUrl.optional(),
  /** CSS selector or visible text that proves the sign-in worked, e.g. "#user-menu" or "Welcome back". */
  successIndicator: z.string().trim().max(300).optional(),
});

const VIEWPORT_IDS = ['desktop-1920', 'desktop-1280', 'tablet-768', 'mobile-375'] as const;

export const startRunSchema = z
  .object({
    targetUrl: httpUrl,
    projectName: z.string().trim().max(100).optional(),
    authorizationConfirmed: z.literal(true, { error: 'You must confirm you are authorized to test this website' }),
    credentials: z.array(credentialSchema).max(10).default([]),
    environment: z.enum(EnvironmentType).default('STAGING'),
    modules: z.array(z.enum(TestModule)).min(1).optional(),
    viewports: z.array(z.enum(VIEWPORT_IDS)).min(1).optional(),
    maxPages: z.number().int().min(1).max(300).optional(),
    maxDepth: z.number().int().min(0).max(10).optional(),
    timeLimitMinutes: z.number().int().min(2).max(40).optional(),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.credentials.forEach((c, i) => {
      const key = c.roleName.toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['credentials', i, 'roleName'], message: 'must be unique' });
      seen.add(key);
      // Credentials may only be submitted to the authorized target host.
      const host = new URL(body.targetUrl).hostname;
      if (c.loginUrl && !isUrlAllowed(c.loginUrl, [host])) {
        ctx.addIssue({ code: 'custom', path: ['credentials', i, 'loginUrl'], message: `must be on the target host (${host})` });
      }
    });
  });

export async function getCapabilities(_config: AppConfig) {
  const health = await collectHealth();
  const { database, queue } = health.services;
  const reasons: string[] = [];
  if (!database.configured) reasons.push('PostgreSQL is not configured (DATABASE_URL is not set).');
  else if (!database.ok) reasons.push(`PostgreSQL is unavailable: ${database.error ?? 'unknown error'}`);
  else if (!queue.ok) reasons.push(`Job queue: ${queue.error ?? 'unavailable'}`);
  if (!ENGINE_AVAILABLE) reasons.push('The test execution engine is not installed yet.');
  return {
    canStartRuns: reasons.length === 0,
    reasons,
    database: database.configured && database.ok,
    queue: queue.ok,
    workers: queue.workers ?? 0,
    engine: ENGINE_AVAILABLE,
  };
}

/**
 * Until user accounts exist, runs are attributed to one local operator account.
 * It has no usable password (cannot sign in); replace with the signed-in user once authentication is built.
 */
async function localOperator() {
  return getPrisma().user.upsert({
    where: { email: 'operator@awt.local' },
    create: { email: 'operator@awt.local', passwordHash: '!disabled', name: 'Local operator', role: 'ADMIN' },
    update: {},
  });
}

const bytes = (b: Buffer) => new Uint8Array(b);

export function runsRouter(config: AppConfig): Router {
  const router = Router();
  const allowPrivate = parseAllowPrivate(config.ALLOW_PRIVATE_TARGETS);

  router.get('/capabilities', asyncRoute(async (_req, res) => {
    res.json(await getCapabilities(config));
  }));

  /** Start Testing: validate → safety-check → reachability → project (+ encrypted credentials) → queue. */
  router.post('/runs', asyncRoute(async (req, res) => {
    const parsed = startRunSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      // Only paths + messages are returned — never the submitted values.
      throw new HttpError(400, 'validation_failed', 'Some fields are invalid.', {
        fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const caps = await getCapabilities(config);
    if (!caps.canStartRuns) {
      // Credentials in the request are discarded here: nothing is stored or logged.
      throw new HttpError(503, 'run_execution_unavailable', 'Test runs cannot start yet.', { reasons: caps.reasons });
    }
    const body = parsed.data;
    const target = new URL(body.targetUrl);
    const safe = await checkUrlSafety(target.href, { allowPrivate });
    if (!safe.ok) throw new HttpError(400, 'target_not_allowed', `This address cannot be tested: ${safe.reason}.`);
    const check = await checkTarget(target.href, { allowPrivate });
    if (!check.reachable) {
      throw new HttpError(422, 'target_unreachable', `The website could not be reached: ${check.error ?? `HTTP ${check.statusCode}`}.`, { check });
    }

    const db = getPrisma();
    const operator = await localOperator();
    const baseUrl = target.origin + (target.pathname === '/' ? '' : target.pathname.replace(/\/+$/, ''));
    const host = target.hostname.toLowerCase();
    let project = await db.project.findFirst({ where: { ownerId: operator.id, baseUrl } });
    const projectData = {
      name: body.projectName || check.title || host,
      environment: body.environment,
      allowedDomains: [host],
      authorizationConfirmedAt: new Date(),
      authorizationConfirmedBy: operator.id,
      ...(body.maxPages ? { maxPages: body.maxPages } : {}),
      ...(body.maxDepth !== undefined ? { maxDepth: body.maxDepth } : {}),
    };
    project = project
      ? await db.project.update({ where: { id: project.id }, data: projectData })
      : await db.project.create({ data: { ownerId: operator.id, baseUrl, ...projectData } });

    if (body.credentials.length) {
      const ring = createKeyRing(config.CREDENTIAL_KEY_VERSION, { [config.CREDENTIAL_KEY_VERSION]: config.CREDENTIAL_MASTER_KEY });
      for (const c of body.credentials) {
        const u = encryptSecret(ring, c.username, credentialAad(project.id, c.roleName, 'username'));
        const p = encryptSecret(ring, c.password, credentialAad(project.id, c.roleName, 'password'));
        const data = {
          label: c.roleName, loginUrl: c.loginUrl ?? null, keyVersion: u.keyVersion,
          loginConfig: c.successIndicator ? { successIndicator: c.successIndicator } : {},
          usernameEnc: bytes(u.ciphertext), usernameIv: bytes(u.iv), usernameTag: bytes(u.authTag), passwordEnc: bytes(p.ciphertext), passwordIv: bytes(p.iv), passwordTag: bytes(p.authTag),
        };
        await db.credential.upsert({ where: { projectId_roleName: { projectId: project.id, roleName: c.roleName } }, create: { projectId: project.id, roleName: c.roleName, ...data }, update: data });
      }
    }

    const { run, job } = await enqueueTestRun({
      projectId: project.id,
      startedById: operator.id,
      configSnapshot: {
        modules: body.modules ?? [...TestModule],
        viewports: body.viewports ?? ['desktop-1280', 'tablet-768', 'mobile-375'],
        maxPages: body.maxPages ?? Math.min(project.maxPages, 40),
        maxDepth: body.maxDepth ?? Math.min(project.maxDepth, 4),
        timeLimitMinutes: body.timeLimitMinutes ?? 25,
        environment: project.environment,
        credentialRoles: body.credentials.map((c) => c.roleName),
        reachability: { status: check.statusCode, finalUrl: check.finalUrl, title: check.title },
      },
    });
    res.status(202).json({ runId: run.id, jobId: job.id, projectId: project.id, status: run.status });
  }));

  return router;
}
