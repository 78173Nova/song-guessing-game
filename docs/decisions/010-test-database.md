# 010 – Test database: PGlite

Date: 10 Nov 2026 · Status: decided

## Decision
Tests for `lib/db/` run against **PGlite**: a real Postgres that runs inside the test process, in memory.
Each test run starts with an empty database, loads `db/schema.sql` and throws everything away afterwards.
PGlite is installed as a development dependency only, so it never reaches the deployed app.

## Why
- `CLAUDE.md` rule 8: tests never touch the real Neon database. They must also run in the GitHub Action,
  which has no database and no `DATABASE_URL`.
- It is real Postgres, so the tests check our actual SQL and schema, not a pretend version of it.

## Alternatives
- **Fake `lib/db/` functions in tests:** no extra package, but SQL mistakes only show up in the real app.
- **A separate Neon branch for tests:** real Neon, but needs internet and a secret in CI, and is slower.

## Limits
- One extra development package.
- PGlite is not exactly Neon: connection handling and the `@neondatabase/serverless` driver are not tested.
  Clicking through the Vercel preview URL covers that part.

## How it could change
If PGlite causes problems, the database tests can switch to fakes. Only the test setup changes, not `lib/db/`.
