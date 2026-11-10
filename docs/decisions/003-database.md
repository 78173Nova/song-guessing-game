# 003 – Database: Neon Postgres

Date: 10 Nov 2026 · Status: decided

## Decision
All persistent data (song list, cached preview URLs, games, later rooms and players) lives in a Postgres
database on Neon. There are two database branches:
- `main` – only for the deployed app (the Neon console calls this branch `production`)
- `dev` – for local development, shared by the team

Tests do **not** use Neon; they use a temporary test database.
All database code lives in `lib/db/`; the connection comes from the `DATABASE_URL` environment variable.

## Why
- Vercel has **no persistent disk**. Files or SQLite would disappear on every restart.
- A hosted database is **shared by all users** – required for multiplayer (all phones see the same room).
- Postgres is relational: songs, games, rounds and players are connected. That fits better than a
  document database.
- Two branches keep real demo data apart from development data: a mistake during development does not
  break the presentation app.
- A seed script fills the database the same way every time – the whole team has the same data.

## Alternatives
- **SQLite (course default):** simple, but data is lost on Vercel.
- **Supabase:** Postgres plus login and real-time in one – more features, but more to understand and
  stronger lock-in to one provider.
- **Firebase / MongoDB:** document databases, a worse fit for connected data.

## Limits
- Free plan: limited storage and compute. **The database can pause after inactivity** and takes a moment
  to wake up → open the app once before the presentation.
- Every query goes over the internet: slower than a local file.
- The connection string is a password (see the secrets rules).
- Schema changes only through one person (Niklas), to avoid invisible conflicts.

## How it could change
Because SQL only lives in `lib/db/`, the provider (e.g. Supabase, our own Postgres server) could be
swapped by changing that folder and the connection string.

## Update 10 Nov 2026: how `lib/db/` is built
- **One small `Db` type:** every `lib/db/` function takes the database as a parameter (`query(sql, params)`).
  The app passes Neon (`getDb()`), the tests pass PGlite (decision 010). Values always go in as parameters,
  never pasted into the SQL text, so input cannot change a query.
- **Seed can run again:** `db/schema.sql` uses `IF NOT EXISTS`; a song is unique by artist + title, ignoring
  upper/lower case. Re-running the seed only updates year and genre and keeps cached previews.
  Alternative: delete and reload all songs – simpler, but it would throw away every cached preview.
- **Seed runs with plain Node:** Node 24 runs TypeScript files directly, so no extra tool (like `tsx`) is
  needed. For that, `tsconfig.json` allows imports ending in `.ts`.
- Limit: the games and rounds tables are added with `feature/game-core`.

## Update 10 Nov 2026: games and rounds tables
`games` (random UUID, start time) and `rounds` (song, 4 shown titles, correct position, status, times,
chosen option, points). The database itself refuses impossible rows: not exactly 4 options, an unknown status,
the same song twice in a game, an answered round that was never sent.
No total-score column: the total is the sum of the round points, so the two can never disagree.
Note: the Neon console calls our `main` branch `production`; Vercel Preview and `.env.local` use `dev`.
