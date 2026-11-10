# Spec 001 – Base: setup + solo game online

Owner: Niklas · Branch: build in several small branches (see "Suggested order") · Target: 12 Nov 2026

## Why
Nobody else in the team can start coding until there is a shared, working foundation: a repository with
rules, an app that deploys to a public URL, a connected database and one complete game loop. Deploying
early also shows the "works only on my laptop" problems while they are still cheap to fix.
The base sets the patterns the others will copy (where logic lives, how the API is called, how tests are
written), so it should be simple and clean rather than feature-rich.
When a line below can be read two ways, choose the simpler option that keeps the server in control.

## What
### Repository and setup
- [ ] Public GitHub repository; `main` protected (pull request + passing checks required, no bypassing; see decision 009)
- [ ] `.gitignore` covers `.env*` (except `.env.example`), `node_modules`, build output – committed **before** any secret exists
- [ ] `.env.example` lists every variable with a placeholder (`DATABASE_URL=`)
- [ ] `CLAUDE.md` and `docs/` from the starter package are in the repository
- [ ] Next.js (App Router, TypeScript) project; dependencies installed with exact versions; lockfile committed
- [ ] `npm run dev`, `npm test`, `npm run lint`, `npm run build`, `npm run db:seed` all work

### Hosting and database
- [ ] Repository connected to Vercel; every merge to `main` deploys; pull requests get a preview URL
- [ ] Neon database with branches `main` (production) and `dev` (development); `DATABASE_URL` set locally and in Vercel
- [ ] `db/schema.sql` creates a `songs` table: id, title, artist, year, genre, cached preview URL,
      cached artwork URL, cached store link, when the preview was cached
- [ ] Seed script loads about 30 well-known songs (artist, title, original year, genre); running it twice does not create duplicates
- [ ] The seed script also looks up each song's preview on iTunes **in advance** (through `lib/music/`), spaced out
      to stay under ~20 requests per minute, and skips songs whose preview is already cached. If iTunes fails for a
      song, the seed continues and that song stays without a preview
- [ ] All SQL lives in `lib/db/`

### Music API
- [ ] `lib/music/` looks up a song's preview on iTunes (search by artist + title), with a 5-second timeout
- [ ] Picks the matching track (same artist, title matches after clean-up), skips karaoke/live/remix versions
- [ ] Caches the preview URL, artwork and store link in the `songs` table; uses the cache when present
- [ ] Returns a clear error result instead of throwing when iTunes fails, times out or finds nothing

### Game (server)
- [ ] Game logic in `lib/game/` as plain functions (no database, no network): build rounds, check an answer, score
- [ ] `POST /api/games` starts a game: picks 10 distinct songs that already have a cached preview (normally no
      iTunes call), builds 4 options per round (1 correct + 3 wrong titles from other songs, shuffled), stores the
      game and its rounds, returns the game ID (a random UUID)
- [ ] `POST /api/games/[id]/next` sends **one round at a time**: round number, preview URL and the 4 options,
      **without the correct answer**. The server stores when it sent the round (`started_at`). It is rejected
      while the current round is still unanswered, and after the last round
- [ ] `POST /api/games/[id]/answer` takes round number + chosen option, validates it, stores it, returns
      correct/incorrect, the correct song (title, artist, artwork, store link) and points
- [ ] The answer route also accepts "skip" instead of an option, for when the preview failed to load in the browser:
      the round is marked `skipped`, gives 0 points and returns the correct song like a normal answer
- [ ] Rejected with a clear error: unknown game, round number out of range, round not sent yet, option not one of
      the four, round already answered or skipped, malformed input
- [ ] Scoring: 100 for correct, plus a speed bonus of up to 50 falling linearly over 15 seconds, rounded to whole
      points; 0 for wrong, timed out or skipped; the server measures time from that round's `started_at`
- [ ] If fewer than 10 songs with a preview are available, the game does not start and the API returns a clear error
- [ ] Tables for games and rounds/answers (schema reviewed by Niklas); a round stores when it was sent and
      whether it is open, answered or skipped

### Game (UI)
- [ ] Start screen with a "Start game" button and a one-line explanation
- [ ] Round screen: clip plays, 15-second countdown, 4 big answer buttons, round number and score
- [ ] After answering: right/wrong, the correct song with artwork, points earned, "Next" button
- [ ] Results screen: total score, list of the 10 songs, "Play again"
- [ ] Clear messages for: music source unreachable, preview failed to load (round skipped), network error
- [ ] "Previews provided courtesy of iTunes" visible; usable on a phone-sized screen

### Tests and checks
- [ ] Vitest tests for `lib/game/`: correct answer, wrong answer, timeout, double answer, invalid option, score bonus edges (0 s, 15 s, beyond)
- [ ] Tests for `lib/music/` with fake responses: success, timeout, error code, no results, wrong artist, missing preview
      (search in the US store, `country=US`)
- [ ] Tests for `lib/db/` run against PGlite, a temporary Postgres inside the test process (decision 010)
- [ ] No test calls the real iTunes API or the real Neon database
- [ ] GitHub Action runs `npm ci`, lint, tests and build on every pull request
- [ ] `README.md`: project description, deployed URL, team members (name + student number placeholders), run and test commands, required environment variables

## Out of scope
- Multiplayer, rooms, QR codes, presentation mode, online duel
- Accounts or login
- Game modes other than "guess the title"; genre/decade filters
- The full 300+ song catalogue (person 2)
- Design polish beyond clean and usable
- MusicBrainz or any other API

## Done when
- On the **Vercel URL**, one player can start a game, hear 10 clips, answer, see right/wrong and the final score – on a laptop and on a phone.
- With iTunes blocked (simulated in tests), the app shows a clear message instead of crashing.
- The browser's network tab never shows the correct answer before answering.
- `npm test` passes locally and in the GitHub Action on `main`.
- No secret is in the repository or its history.
- The decision docs touched by the base (001–006) still match what was built (update them if not).

## Suggested order (one branch and pull request each)
1. `chore/setup` – Next.js project, `.gitignore`, `.env.example`, starter docs, lint, Vitest,
   GitHub Action (lint, tests, build) → deploy to Vercel. The Action comes first because merging depends
   on green checks (decision 009).
2. `feature/database` – schema, `lib/db/`, seed script with ~30 songs
3. `feature/music-api` – `lib/music/` with cache and error handling + tests
4. `feature/game-core` – `lib/game/` + API routes + tests
5. `feature/solo-ui` – screens
6. `chore/readme` – README

Small branches are easier to review and give the team something to learn from step by step.
For the base, teammates are not available for reviews yet: Niklas merges each pull request once the checks are
green, and the team goes through them together at the next meeting (allowed by decision 009).

## Decided on 10 Nov 2026
- Rounds are sent one at a time, so the timer is fair and later preview URLs stay on the server (decision 004)
- A round whose preview fails is stored as `skipped` (decision 006)
- Previews are looked up in advance by `npm run db:seed`, not at game start (decision 006)
- Database tests use PGlite (decision 010)
- Game ID = random UUID; speed bonus rounded to whole points; iTunes searches the US store
