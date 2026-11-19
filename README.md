# Autonomous Web Tester

AI-powered platform that explores a website, tests its UI, buttons, navigation,
forms and passwords, and reports **only evidence-backed** issues with screenshots.

Status: **Complete frontend UI** built (awaiting approval before backend development).
PostgreSQL and Redis are intentionally deferred. The frontend runs without them: projects,
test configurations and settings are kept in the browser (never passwords, tokens or API keys),
and every results section shows an honest empty state. A **Demo data** switch in the top bar
fills the app with clearly labelled sample data (DEMO tags, banner, watermarked illustrations,
fictional `.example` sites) for previewing the UI.

## Workspaces

| Path | Package | Purpose |
|---|---|---|
| `apps/web` | `@awt/web` | React 19 + Vite 7 + Tailwind 4 dashboard |
| `apps/api` | `@awt/api` | Express 5 REST API (see *API endpoints* below) |
| `apps/worker` | `@awt/worker` | Test execution worker (Playwright; BullMQ from Phase 2) |
| `packages/shared` | `@awt/shared` | Shared enums, viewport matrix, validated config (zod) |
| `packages/crypto` | `@awt/crypto` | AES-256-GCM credential vault, sensitive-data masking, authorized-domain guard |
| `packages/db` | `@awt/db` | Prisma schema (15 tables) + initial migration |
| `packages/engine` | `@awt/engine` | Testing engine; Phase 0 defines the evidence contract |
| `test-fixtures` | `@awt/test-fixtures` | "Acme Store" — local site with 22 documented planted bugs |

## Quick start

```bash
npm install
npx -w @awt/worker playwright install chromium
cp .env.example .env          # then: npm run gen:key  → paste into JWT_SECRET and CREDENTIAL_MASTER_KEY
npm run doctor                # environment check
npm run dev                   # api :4000 · web :5173 · fixture :4500 · worker
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run api, worker, web and fixture together |
| `npm run dev:api` / `dev:web` / `dev:worker` / `dev:fixture` | Run one service |
| `npm run typecheck` | TypeScript check of every workspace |
| `npm test` | Unit tests + fixture HTTP and browser tests |
| `npm run build` | Production build of all packages and apps |
| `npm run doctor` | Check Node, `.env`, Postgres, Redis, Playwright, AI config |
| `npm run gen:key` | Generate a 32-byte hex secret |
| `npm run db:generate` | Generate Prisma client (no database needed) |

## Frontend (http://localhost:5173)

React 19 · TypeScript · Tailwind 4 · React Router 8 · Lucide icons. Pages:

| Route | Page |
|---|---|
| `/login`, `/forgot-password` | Sign in (local preview sign-in — authentication API not connected yet) |
| `/` | Dashboard — totals, failed-tests-per-run chart, issues by severity, activity |
| `/projects`, `/projects/:id` | Projects list (table/cards, search, status filter) and project detail |
| `/projects/new`, `/projects/:id/edit` | Add / edit website — URL + live connectivity check, environment, auth type, test logins |
| `/configure`, `/projects/:id/configure` | Test configuration — 8 modules, viewports, crawl limits, safeguards |
| `/live` | Live testing — progress, current page, log, stop (demo simulation until the engine exists) |
| `/issues`, `/issues/:id` | Issues — confirmed / needs review / flaky, filters, evidence, expected vs actual, steps |
| `/screenshots` | Screenshot gallery, before/after pairs, full-screen viewer (← → Z Esc) |
| `/reports` | Summary, severity & category breakdown, PDF/Excel export dialog |
| `/settings` | Profile, preferences, AI provider, security |

Code: `apps/web/src/components` (design system: ui, forms, feedback, badges, charts, Lightbox,
AppLayout), `apps/web/src/pages`, `apps/web/src/lib` (store, demo data, live simulation, catalog).

## API endpoints

| Method & path | Needs | Purpose |
|---|---|---|
| `GET /api/health` | — | Service status (Phase 0) |
| `GET /api/capabilities` | — | Whether runs can start, and every reason why not |
| `POST /api/targets/check` | — | One real HTTP GET of the target (status, title, redirects). Not a test result |
| `POST /api/runs` | DB + Redis + engine | Validates input; until Phase 2 answers `503 run_execution_unavailable` with reasons. Credentials are never logged or echoed |
| `GET /api/dashboard/summary` | DB | Totals, latest run, active runs |
| `GET /api/projects`, `/api/runs`, `/api/runs/:id` | DB | Projects, runs, run progress, module breakdown, event log |
| `GET /api/issues`, `/api/issues/:id` | DB | Issues (filter by `classification`, `severity`, `status`, `runId`, `projectId`) with evidence |
| `GET /api/artifacts/:id/file`, `/api/reports`, `/api/reports/:id/file` | DB | Screenshots/evidence files and reports from `STORAGE_LOCAL_DIR` (resolved from the repo root) |

Database-backed endpoints answer `503 database_not_configured` until `DATABASE_URL` is set.

## Enabling PostgreSQL later

1. Native install: set `DATABASE_URL` in `.env` (a commented line with a generated
   password is already there), then run `npm run db:setup-native` — it prompts for the
   `postgres` superuser password and creates a least-privilege `awt` role + database.
   Docker alternative: `npm run services:up` and use the Docker URL from `.env.example`.
2. `npm run db:deploy` — applies `packages/db/prisma/migrations/20261117000000_init`.
3. `npm run db:status` — confirm migrations are applied.

## Enabling Redis later (required from Phase 2)

Install Redis/Memurai or Docker, then uncomment `REDIS_URL` in `.env`.
