# Song Guessing Game

A browser music quiz: you hear a 30-second preview of a well-known song and pick the right title from four
options. Five rounds per game – the faster you answer, the more points you get.
Team project for the course "Introduction to Programming".

**Play it:** https://song-guessing-game-tawny.vercel.app

## Team

| Name | Student number |
|---|---|
| Niklas `<surname>` | `<student number>` |
| Jasper `<surname>` | `<student number>` |
| Steinar `<surname>` | `<student number>` |
| Karin `<surname>` | `<student number>` |

What we are building and who does what: [`docs/PLAN.md`](docs/PLAN.md) (scope and step-by-step plan).

## How a game works

1. **Start game** – the server picks 5 songs and the browser loads the first clip ("Loading first song…").
2. **3 – 2 – 1** – then the clip, the four answer buttons and the 15-second countdown start together.
3. **Answer** – the server checks it: 100 points for the right title plus up to 50 for speed.
   You see right/wrong, the cover, the song and a link to Apple Music.
4. **Results** – total score and the 5 songs, then **Play again**.

The server decides everything (which songs, the options, right or wrong, the points). The browser never
receives the correct answer before you have answered.

## Tech stack

| Part | Tool | Why (details in [`docs/decisions/`](docs/decisions/)) |
|---|---|---|
| App + server | Next.js 16 (App Router, TypeScript) | UI and server routes in one project ([001](docs/decisions/001-stack.md)) |
| Hosting | Vercel | Deploys `main` automatically, a preview URL per pull request ([002](docs/decisions/002-hosting.md)) |
| Database | Neon Postgres | Vercel has no permanent disk ([003](docs/decisions/003-database.md)) |
| Music | iTunes Search API | 30-second previews, no key needed ([005](docs/decisions/005-curated-song-list.md), [006](docs/decisions/006-api-failure.md)) |
| Tests | Vitest + PGlite | Fast, offline, with a real Postgres in memory ([010](docs/decisions/010-test-database.md)) |

## Run it locally

You need Node.js 24 (LTS) and npm.

```bash
npm install
cp .env.example .env.local      # then put the database connection string into .env.local
npm run db:seed                 # creates the tables, loads the songs, looks up their previews (≈2 min the first time)
npm run dev                     # open http://localhost:3000 in Chrome, Safari or Firefox
```

### Environment variables

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Connection string of a Neon Postgres database. Locally: the `dev` branch. Never commit it. |

## Tests and checks

```bash
npm test          # all tests, once (they never call the real iTunes API or the real database)
npm run lint      # code style and common mistakes
npm run build     # production build, also checks all TypeScript types
```

The same three checks run automatically on every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml));
`main` only accepts pull requests whose checks pass.

## Project structure

| Folder | What lives there |
|---|---|
| `app/` | The page and the server routes (`app/api/games/...`) |
| `components/` | The game screens (`SoloGame.tsx`) |
| `lib/game/` | Game rules: build rounds, check answers, score – no database, no network |
| `lib/api/` | What each server route does step by step |
| `lib/db/` | All database code – the only place with SQL |
| `lib/music/` | Everything about iTunes – the only place that calls it |
| `lib/client/` | Browser-side logic without UI: screen state, server calls, clip loading |
| `db/` | Database schema, seed script and the song list |
| `tests/` | Tests |
| `docs/`, `specs/` | Plan, decisions and specs |

## For new team members

1. Install Node.js 24 (LTS), Git, GitHub CLI (`gh auth login`) and Claude Code.
2. Accept the GitHub invitation, clone the repository, run `npm install`.
3. Ask Niklas privately for the `dev` database connection string. Copy `.env.example` to `.env.local` and fill it in.
   Never paste it into a chat, the code or a commit.
4. `npm run dev` should start the app; `npm test` should pass.
5. Read [`CLAUDE.md`](CLAUDE.md) (rules), [`docs/PLAN.md`](docs/PLAN.md) (scope, step-by-step plan, roles) and
   [`docs/course/requirements.md`](docs/course/requirements.md).
6. Your first task: write the spec for your step with Claude Code (prompt in `docs/PLAN.md`, section 7).
   Then every task: a new branch, tests first, a pull request (`docs/PLAN.md`, section 8).
7. Open the app in Chrome, Safari or Firefox – the VS Code built-in browser cannot play the music.

## Credits and limits

- Previews provided courtesy of iTunes. The app only streams the previews and links every song to Apple Music;
  it never downloads or stores audio.
- The free Neon database sleeps after a while – the first game after a break can take a few seconds longer.
- Known limits of each part are listed in the "Limits" section of its decision in [`docs/decisions/`](docs/decisions/).
