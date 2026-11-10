# 003 – Database: Neon Postgres

Date: 10 Nov 2026 · Status: decided

## Decision
All persistent data (song list, cached preview URLs, games, later rooms and players) lives in a Postgres
database on Neon. There are two database branches:
- `main` – only for the deployed app
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
