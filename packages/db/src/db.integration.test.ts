/**
 * Live-database integration test. Runs only when DATABASE_URL is set (`npm run test:integration -w @awt/db`).
 * Every write happens inside a transaction that is ALWAYS rolled back, so no rows are left behind and nothing
 * here can be mistaken for a real testing result.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { checkDatabase, describeDbError, disconnectPrisma, getPrisma } from './index.js';

const live = Boolean(process.env.DATABASE_URL?.trim());
class Rollback extends Error {}

/** Runs `fn` in a transaction and rolls it back afterwards, returning what `fn` returned. */
async function inRollback<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await getPrisma().$transaction(
      async (tx) => {
        out = await fn(tx);
        throw new Rollback();
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out as T;
}

const tag = `itest-${Date.now()}`;

describe.skipIf(!live)('PostgreSQL integration (rolled back)', () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('connects', async () => {
    const r = await checkDatabase();
    expect(r).toMatchObject({ ok: true, configured: true });
  });

  it('inserts the full chain user → project → run → page → test case → issue → screenshot → report and reads it back', async () => {
    const result = await inRollback(async (tx) => {
      const user = await tx.user.create({ data: { email: `${tag}@integration.invalid`, passwordHash: 'not-a-real-hash', name: 'Integration Check' } });
      const project = await tx.project.create({ data: { ownerId: user.id, name: `${tag} project`, baseUrl: 'http://localhost:4500' } });
      const run = await tx.testRun.create({ data: { projectId: project.id, startedById: user.id, configSnapshot: { modules: ['NAVIGATION'] } } });
      const home = await tx.page.create({ data: { runId: run.id, url: 'http://localhost:4500/', normalizedUrl: 'http://localhost:4500/' } });
      const child = await tx.page.create({ data: { runId: run.id, url: 'http://localhost:4500/cart', normalizedUrl: 'http://localhost:4500/cart', discoveredFromId: home.id } });
      const tc = await tx.testCase.create({ data: { runId: run.id, pageId: child.id, module: 'NAVIGATION', name: 'link resolves', status: 'FAILED' } });
      const issue = await tx.issue.create({
        data: {
          issueKey: `${tag}-1`, runId: run.id, projectId: project.id, pageId: child.id, testCaseId: tc.id,
          classification: 'CONFIRMED', module: 'NAVIGATION', category: 'Broken link', title: 'Integration check issue',
          description: 'Rolled back — not a real result.', severity: 'HIGH', expectedResult: 'HTTP 200', actualResult: 'HTTP 404',
          stepsToReproduce: ['Open /', 'Click Cart'], pageUrl: child.url, fingerprint: `${tag}-fp`,
        },
      });
      await tx.artifact.create({ data: { runId: run.id, pageId: child.id, issueId: issue.id, type: 'ELEMENT_SCREENSHOT', storagePath: `runs/${run.id}/x.png`, mimeType: 'image/png', sizeBytes: 1, sha256: '0'.repeat(64) } });
      await tx.report.create({ data: { runId: run.id, format: 'PDF', storagePath: `reports/${run.id}.pdf`, sizeBytes: 1, generatedById: user.id } });

      // Read everything back through the relations.
      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: {
          owner: true,
          runs: { include: { pages: { include: { discoveredFrom: true } }, testCases: true, issues: { include: { artifacts: true, page: true } }, reports: true } },
        },
      });
    });

    expect(result.owner.email).toBe(`${tag}@integration.invalid`);
    const run = result.runs[0]!;
    expect(run.status).toBe('QUEUED'); // schema default
    expect(run.pages).toHaveLength(2);
    expect(run.pages.find((p) => p.url.endsWith('/cart'))?.discoveredFrom?.url).toBe('http://localhost:4500/');
    expect(run.testCases[0]?.status).toBe('FAILED');
    expect(run.issues[0]?.severity).toBe('HIGH');
    expect(run.issues[0]?.stepsToReproduce).toEqual(['Open /', 'Click Cart']);
    expect(run.issues[0]?.artifacts).toHaveLength(1);
    expect(run.issues[0]?.page?.url).toBe('http://localhost:4500/cart');
    expect(run.reports[0]?.format).toBe('PDF');
  });

  it('left nothing behind', async () => {
    expect(await getPrisma().user.count({ where: { email: { startsWith: 'itest-' } } })).toBe(0);
  });

  it('enforces foreign keys (P2003 → 400 invalid_reference)', async () => {
    const err = await inRollback((tx) => tx.project.create({ data: { ownerId: '00000000-0000-0000-0000-000000000000', name: 'x', baseUrl: 'http://localhost' } })).catch((e) => e);
    expect(describeDbError(err)).toMatchObject({ status: 400, code: 'invalid_reference' });
  });

  it('enforces unique constraints (P2002 → 409 conflict)', async () => {
    const err = await inRollback(async (tx) => {
      await tx.user.create({ data: { email: `${tag}-dup@integration.invalid`, passwordHash: 'x', name: 'a' } });
      await tx.user.create({ data: { email: `${tag}-dup@integration.invalid`, passwordHash: 'x', name: 'b' } });
    }).catch((e) => e);
    expect(describeDbError(err)).toMatchObject({ status: 409, code: 'conflict' });
  });

  it('cascades deletes from a run to its pages, issues and screenshots', async () => {
    const counts = await inRollback(async (tx) => {
      const user = await tx.user.create({ data: { email: `${tag}-c@integration.invalid`, passwordHash: 'x', name: 'c' } });
      const project = await tx.project.create({ data: { ownerId: user.id, name: 'c', baseUrl: 'http://localhost' } });
      const run = await tx.testRun.create({ data: { projectId: project.id, startedById: user.id, configSnapshot: {} } });
      const page = await tx.page.create({ data: { runId: run.id, url: 'http://localhost/', normalizedUrl: 'http://localhost/' } });
      await tx.artifact.create({ data: { runId: run.id, pageId: page.id, type: 'PAGE_SCREENSHOT', storagePath: 'x', mimeType: 'image/png', sizeBytes: 1, sha256: '0'.repeat(64) } });
      await tx.testRun.delete({ where: { id: run.id } });
      return { pages: await tx.page.count({ where: { runId: run.id } }), artifacts: await tx.artifact.count({ where: { runId: run.id } }), project: await tx.project.count({ where: { id: project.id } }) };
    });
    expect(counts).toEqual({ pages: 0, artifacts: 0, project: 1 });
  });
});

describe('describeDbError', () => {
  it('ignores non-database errors', () => {
    expect(describeDbError(new Error('x'))).toBeUndefined();
  });
  it('maps record-not-found to 404', () => {
    const e = new Prisma.PrismaClientKnownRequestError('No record', { code: 'P2025', clientVersion: 'test' });
    expect(describeDbError(e)).toMatchObject({ status: 404, code: 'not_found' });
  });
});
