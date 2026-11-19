// Environment diagnostics: checks .env, PostgreSQL, Redis and Playwright browsers.
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';

const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✘\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
let failures = 0;

console.log('\nAutonomous Web Tester — environment check\n');

const [major] = process.versions.node.split('.').map(Number);
major >= 20 ? ok(`Node.js ${process.versions.node}`) : (bad(`Node.js ${process.versions.node} (need >= 20)`), failures++);

const env = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  ok('.env present');
} else {
  bad('.env missing — copy .env.example to .env');
  failures++;
}

for (const k of ['JWT_SECRET', 'CREDENTIAL_MASTER_KEY']) {
  /^[0-9a-f]{64}$/i.test(env[k] ?? '') ? ok(`${k} set`) : (bad(`${k} invalid — run: npm run gen:key`), failures++);
}

function probe(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 1500 });
    s.on('connect', () => (s.destroy(), resolve(true)));
    s.on('error', () => resolve(false));
    s.on('timeout', () => (s.destroy(), resolve(false)));
  });
}

async function checkUrl(name, url, required) {
  if (!url) return warn(`${name}: not configured yet (optional for now)`);
  const u = new URL(url);
  const port = Number(u.port || (u.protocol.startsWith('redis') ? 6379 : 5432));
  if (await probe(u.hostname, port)) ok(`${name} reachable at ${u.hostname}:${port}`);
  else if (required) (bad(`${name} NOT reachable at ${u.hostname}:${port}`), failures++);
  else warn(`${name} not reachable at ${u.hostname}:${port}`);
}

// Once configured, a set URL must actually be reachable.
await checkUrl('PostgreSQL', env.DATABASE_URL, true);
await checkUrl('Redis', env.REDIS_URL, true);

try {
  const { chromium } = await import('playwright');
  existsSync(chromium.executablePath()) ? ok('Playwright Chromium installed') : warn('Playwright Chromium missing — run: npx playwright install chromium');
} catch {
  warn('playwright package not installed');
}

env.AI_PROVIDER && env.AI_PROVIDER !== 'none' ? ok(`AI provider: ${env.AI_PROVIDER}`) : warn('AI provider not configured (optional until Phase 5)');

console.log(failures ? `\n${failures} problem(s) found.\n` : '\nAll required checks passed.\n');
process.exit(failures ? 1 : 0);
