# Acme Store — bug-testing fixture

A small local website with **22 planted, documented bugs** and a set of correctly
working "control" elements. It is used to measure the testing engine:

- **Recall:** how many of the bugs in `known-bugs.json` the engine finds.
- **Precision:** whether the engine wrongly reports any of the `controls`.

```bash
npm run dev:fixture        # http://localhost:4500
npm test -w @awt/test-fixtures
```

| Area | What it covers |
|---|---|
| Discovery | public pages, `sitemap.xml`-only page, dropdown-only link, SPA routes reachable only by clicking buttons, login-only pages, admin-only (role-based) pages |
| UI | overlap, misalignment, inconsistent spacing, broken image, responsive overflow, tablet/mobile-only overlap |
| Buttons | dead buttons on public and authenticated pages, plus working buttons as controls |
| Navigation | 404, 500, wrong redirect, redirect loop, missing anchor, SPA soft-404 |
| Forms / passwords | invalid email/phone accepted, weak password accepted, no password rules shown, confirmation mismatch |
| Safety | `Delete my account` is a real destructive action; the engine must ask for approval before clicking it |

Test accounts (fixture-only): `customer@fixture.test` / `Customer#Pass123`,
`admin@fixture.test` / `Admin#Pass123`.

Control endpoints: `POST /__reset` resets all in-memory state; `GET /__state` shows it.
