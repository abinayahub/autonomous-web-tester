/* eslint-disable @typescript-eslint/no-explicit-any -- test assertions on untyped JSON responses */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, resolveInsideStorage } from '@awt/shared';
import { createApp } from './app.js';

const KEY = 'a'.repeat(64);
let api: Server;
let target: Server;
let base = '';
let targetBase = '';

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  target = createServer((req, res) => {
    if (req.url === '/old') return res.writeHead(301, { location: '/home' }).end();
    if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
    if (req.url === '/home') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><title> Acme  Home </title></head></html>');
    res.writeHead(500).end('boom');
  }).listen(0, '127.0.0.1');
  await new Promise((r) => target.once('listening', r));
  // The SSRF guard blocks loopback addresses; only this local test server is allow-listed (exact host:port).
  const port = (target.address() as AddressInfo).port;
  const config = loadConfig({ JWT_SECRET: KEY, CREDENTIAL_MASTER_KEY: KEY, AI_PROVIDER: 'none', ALLOW_PRIVATE_TARGETS: `127.0.0.1:${port}` });
  api = createApp(config).listen(0);
  await new Promise((r) => api.once('listening', r));
  base = `http://127.0.0.1:${(api.address() as AddressInfo).port}/api`;
  targetBase = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
});

afterAll(() => {
  api.close();
  target.close();
});

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('capabilities', () => {
  it('reports that runs cannot start, with every reason', async () => {
    const body = await (await fetch(`${base}/capabilities`)).json() as any;
    expect(body.canStartRuns).toBe(false);
    expect(body.engine).toBe(true);
    expect(body.reasons.join(' ')).toMatch(/DATABASE_URL/);
    expect(body.reasons.join(' ')).not.toMatch(/REDIS/); // the queue runs on PostgreSQL
  });
});

describe('POST /api/runs', () => {
  const valid = {
    targetUrl: 'http://localhost:4500',
    authorizationConfirmed: true,
    credentials: [{ roleName: 'customer', username: 'customer@fixture.test', password: 'Secret#Pass123' }],
  };

  it('rejects missing authorization and never echoes submitted values', async () => {
    const res = await post('/runs', { ...valid, authorizationConfirmed: false });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('authorizationConfirmed');
    expect(text).not.toContain('Secret#Pass123');
    expect(text).not.toContain('customer@fixture.test');
  });

  it('rejects a login URL on a different host', async () => {
    const res = await post('/runs', { ...valid, credentials: [{ ...valid.credentials[0], loginUrl: 'https://evil.example/login' }] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json() as any)).toContain('credentials.0.loginUrl');
  });

  it('rejects duplicate roles and non-http URLs', async () => {
    const dup = await post('/runs', { ...valid, credentials: [valid.credentials[0], valid.credentials[0]] });
    expect(dup.status).toBe(400);
    const ftp = await post('/runs', { ...valid, targetUrl: 'ftp://localhost' });
    expect(ftp.status).toBe(400);
  });

  it('refuses a valid request with 503 and the reasons (no fake run is created)', async () => {
    const res = await post('/runs', valid);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text).error).toBe('run_execution_unavailable');
    expect(text).not.toContain('Secret#Pass123');
  });

  it('returns a clean 400 for malformed JSON', async () => {
    const res = await fetch(`${base}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"x' });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe('invalid_json');
  });
});

describe('database-backed endpoints without a database', () => {
  it.each(['/dashboard/summary', '/projects', '/runs', '/issues', '/reports'])('%s → 503 database_not_configured', async (path) => {
    const res = await fetch(base + path);
    expect(res.status).toBe(503);
    expect((await res.json() as any).error).toBe('database_not_configured');
  });
});

describe('POST /api/targets/check', () => {
  it('follows redirects and reads the real title', async () => {
    const body = await (await post('/targets/check', { url: `${targetBase}/old` })).json() as any;
    expect(body.reachable).toBe(true);
    expect(body.statusCode).toBe(200);
    expect(body.title).toBe('Acme Home');
    expect(body.redirects).toHaveLength(1);
    expect(body.finalUrl).toBe(`${targetBase}/home`);
  });

  it('detects redirect loops', async () => {
    const body = await (await post('/targets/check', { url: `${targetBase}/loop` })).json() as any;
    expect(body.reachable).toBe(false);
    expect(body.error).toMatch(/redirect/);
  });

  it('reports server errors and unreachable hosts honestly', async () => {
    const err = await (await post('/targets/check', { url: `${targetBase}/x` })).json() as any;
    expect(err).toMatchObject({ reachable: false, statusCode: 500 });
    const down = await (await post('/targets/check', { url: `${targetBase.replace(/:\d+$/, '')}:1` })).json() as any;
    expect(down.reachable).toBe(false);
    expect(down.error).toBeTruthy();
  });

  it('refuses internal, loopback and cloud-metadata addresses (SSRF guard)', async () => {
    for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://localhost:4000/api/health', 'http://10.0.0.1/', 'http://[::1]:8080/', 'http://metadata.google.internal/']) {
      const body = await (await post('/targets/check', { url })).json() as any;
      expect(body.reachable, url).toBe(false);
      expect(body.error, url).toMatch(/Blocked for safety/);
    }
  });

  it('rejects invalid URLs and embedded credentials', async () => {
    expect((await post('/targets/check', { url: 'not a url' })).status).toBe(400);
    expect((await post('/targets/check', { url: 'http://u:p@localhost' })).status).toBe(400);
    expect((await post('/targets/check', { url: 'file:///etc/passwd' })).status).toBe(400);
  });
});

describe('resolveInsideStorage', () => {
  it('blocks path traversal', () => {
    const root = process.platform === 'win32' ? 'C:\\storage' : '/storage';
    expect(resolveInsideStorage(root, 'runs/1/shot.png')).toBeTruthy();
    expect(resolveInsideStorage(root, '../secret')).toBeUndefined();
    expect(resolveInsideStorage(root, '/etc/passwd')).toBeUndefined();
    expect(resolveInsideStorage(root, '')).toBeUndefined();
  });
});
