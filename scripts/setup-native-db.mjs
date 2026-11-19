// Creates the "awt" role and database on a natively installed PostgreSQL using the
// credentials in DATABASE_URL. psql prompts for the *postgres superuser* password
// interactively — it is never stored or written anywhere.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env. Uncomment/set it first, e.g. postgresql://awt:<pw>@localhost:5432/awt?schema=public');
  process.exit(1);
}
const url = new URL(env.DATABASE_URL);
const password = decodeURIComponent(url.password);
if (url.username !== 'awt' || !password) {
  console.error('DATABASE_URL must use user "awt" with a password, e.g. postgresql://awt:<pw>@localhost:5432/awt');
  process.exit(1);
}

function findPsql() {
  const root = 'C:\\Program Files\\PostgreSQL';
  if (process.platform === 'win32' && existsSync(root)) {
    const versions = readdirSync(root).sort((a, b) => Number(b) - Number(a));
    for (const v of versions) {
      const p = path.join(root, v, 'bin', 'psql.exe');
      if (existsSync(p)) return p;
    }
  }
  return 'psql';
}

const psql = findPsql();
console.log(`Using ${psql}\nYou will be prompted for the PostgreSQL *superuser* (postgres) password.\n`);
const r = spawnSync(
  psql,
  ['-h', url.hostname, '-p', url.port || '5432', '-U', 'postgres', '-d', 'postgres', '-v', `awt_password=${password}`, '-f', 'scripts/create-local-db.sql'],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
