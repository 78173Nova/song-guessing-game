# SongSnap

A browser music quiz: you hear a well-known song and have 15 seconds to pick the right title, artist or
year from four options – the faster you answer, the more points you get. A solo game has five rounds; a room
game has 3 to 30 (songs per set × sets).
Team project for the course "Introduction to Programming".

**Play it:** https://song-guessing-game-tawny.vercel.app

## Team

| Name | Student number |
|---|---|
| Niklas Liebich | 78173 |
| Jasper Berndt | 70654 |
| Steinar Guðmundsson | 83910 |
| Karin Pernsteiner | 83911 |

What we are building and who does what: [`docs/PLAN.md`](docs/PLAN.md) (scope and step-by-step plan).

## How a game works

1. **Start game** – you choose a mode, a genre and a decade; the server picks 5 songs and the browser loads
   the first clip ("Loading first song…").
2. **3 – 2 – 1** – then the clip, the four answer buttons and the 15-second countdown start together.
3. **Answer** – the server checks it: 100 points for the right answer plus up to 50 for speed.
   You see right/wrong, the cover, the song and a link to Apple Music.
4. **Results** – total score and the 5 songs, each with a link to Apple Music, then **Play again**
   (same settings) or **Change settings**.

The server decides everything (which songs, the options, right or wrong, the points). The browser never
receives the correct answer before you have answered.

## Modes and song catalogue

Details: [spec 003](specs/003-catalogue-modes.md), decisions [005](docs/decisions/005-curated-song-list.md)
(song list) and [013](docs/decisions/013-game-modes.md) (modes and filters).

- **4 modes** – **Title** (the default), **Artist**, **Year** (the real year plus 3 calculated wrong years) and
  **Mixed** (the server picks title, artist or year for each round).
- **Genre and decade tiles** – one genre and one decade (1960s–2020s), both "Any" by default. Tiles that
  would give too few songs are greyed out, with a short note why.
- **Fewer repeats** – the server leaves out the songs of your last 3 games, as long as enough songs are left
  to fill a game.
- **413 songs** from 1960–2026 in 6 genres (Pop, Rock, Hip-hop, R&B / Soul, Dance / Electronic,
  Country / Folk), with at least 10 songs for every genre and decade – except hip-hop before 1980.
- **Year rule** – the year the recording was first released (album or single, whichever came first),
  not when it became a hit or a remaster came out.
- **No explicit clips** – the game never plays a clip marked explicit. Songs removed from the list are
  marked as retired in the database and never played again.

## Rooms and accounts

Details: [spec 002](specs/002-room-core.md), [spec 004](specs/004-accounts-landing.md), decisions
[012](docs/decisions/012-rooms.md) (rooms), [014](docs/decisions/014-accounts.md) (accounts) and
[015](docs/decisions/015-room-games.md) (room games).

- **2 room types** – **Duel** (exactly 2 players) and **Multiplayer** (2–25 players). Every player uses their own
  device and every device plays the music; the server starts each round at the same moment for everyone.
- **Room settings** – the room creator chooses public or private, mode, genres, decades, songs per set (3, 5 or 10)
  and sets (1–3) when creating the room; they cannot be changed afterwards. Everyone sees the standings after each
  round and each set, and their own set summary with Apple Music links.
- **Joining with a code** – with the 6-digit room code, the share link or its QR code; public rooms are also
  listed under **Join a room**. Guests need no account: they pick a nickname and an avatar.
- **Lobby** – the game starts when the room is full, when the room creator starts it, or (public rooms only) after
  a 60-second lobby countdown. After a game, players can choose **Play again** (at most 5 games per room).
- **Accounts** – needed only to create a room. Sign up with email, username and password; the account works only
  after you open the link in the verification email (valid 24 hours). Also: log in and out, forgot password, and
  Account settings (avatar, usual nickname, username, email, password). Passwords are stored only as scrypt hashes.

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
npm run dev                     # open http://localhost:3000 in Chrome, Safari or Firefox (solo game: /solo)
```

### Environment variables

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Connection string of a Neon Postgres database. Locally: the `dev` branch. Never commit it. |
| `BREVO_API_KEY` | Optional locally. Key of the team's Brevo account, used to send the account emails. Without it, local development prints each email (with its link) to the terminal; on Vercel it is required. Never commit it. |
| `EMAIL_FROM` | The sender address verified in Brevo, e.g. a team address, optionally with a name: `SongSnap <team@example.com>`. Needed together with `BREVO_API_KEY`. |
| `APP_URL` | The address of the site, used for links in emails and the room share link, e.g. `http://localhost:3000`. Without it, Vercel's own `VERCEL_URL` is used, then `http://localhost:3000`. |
| `TEAM_ACCOUNTS` | Optional. Team accounts as `email\|username\|password;…`. `npm run db:team-accounts` creates them already verified, or gives an existing one its password back. Never commit it. |

## Tests and checks

```bash
npm test          # all tests, once (they never call the real iTunes API or the real database)
npm run lint      # code style and common mistakes
npm run typecheck # checks all TypeScript types
npm run build     # production build
```

The same four checks run automatically on every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml));
`main` only accepts pull requests whose checks pass.

Load test (by hand, not in CI): create a Multiplayer room, then let bots join it and play like phones.
It targets the live site unless `--url` is given; `--bots` is 1–24 (default 10).

```bash
npm run load-test -- --room 123456 --bots 15
```

## Project structure

| Folder | What lives there |
|---|---|
| `app/` | The pages (front page, solo, create and join a room, account pages) and the server routes (`app/api/games`, `app/api/rooms`, `app/api/accounts`) |
| `components/` | The screens and UI pieces (solo game, rooms, forms); `components/icons/` holds the hand-drawn icons |
| `lib/game/` | Game and room rules: build rounds, check answers, score – no database, no network |
| `lib/accounts/` | Account rules: username, email and password checks, password hashing, tokens – no database, no network |
| `lib/api/` | What each server route does step by step |
| `lib/db/` | All database code – the only place with SQL |
| `lib/music/` | Everything about iTunes – the only place that calls it |
| `lib/email/` | Everything about sending emails (texts, links, Brevo) – the only place that sends them |
| `lib/client/` | Browser-side logic without UI: screen state, server calls, clip loading, countdowns |
| `db/` | Database schema, seed script, the song list and the team accounts script |
| `scripts/` | The load test |
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
