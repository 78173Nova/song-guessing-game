# Project plan: music guessing game

Last updated: 10 Nov 2026 (after the base). Change it through a pull request and add a line under "Changelog".

## 1. Context
- Team: 4 people, everyone works with Claude Code and GitHub.
- Submission: link to the public GitHub repository on Moodle by **23 Nov 2026, 23:59**
  (one member submits). Commits after the deadline do not count.
- Presentation (24 Nov or 4 Dec, not fixed yet): about 3 min live demo at the deployed URL
  + about 3 min repository walkthrough. Any member can be asked about any part.
- Grading (40 % of the course grade, same grade for everyone): It works 20 %, UI/UX 20 %,
  Scope 20 %, Verification 10 %, Security 10 %, Walkthrough 20 %. Details: `docs/course/requirements.md`.
- **Stack approval:** the course default is Python/Streamlit. Using Next.js was approved by the
  professor on 10 Nov 2026 (decision 001).

## 2. Scope
**Status (10 Nov 2026): the base is done** – the solo game runs at https://song-guessing-game-tawny.vercel.app
(spec `specs/001-base.md`).

**Must have**
1. **Solo game** ✅ – 5 rounds, 4 options, speed points, results. Still to add: high scores, better error screens,
   polished phone layout.
2. **Song catalogue** – 300+ well-known songs, filters by genre and decade.
3. **Game modes** – guess the song ✅, guess the artist, guess the year, mixed.
4. **Room core** – create a room, join with a nickname, rounds run by the server (the foundation for 5).
5. **Presentation mode (Kahoot style)** – the big screen shows a QR code, plays the music and shows the leaderboard;
   the audience answers on their phones.

**If time allows** (only once 1–5 work on the live URL)

6. **Online duel** – players in different places, each phone plays the music, rounds start at the same moment.
7. **Typed answers** – type the title instead of choosing from 4.

**Not planned:** accounts or logins, other music sources.

## 3. Stack
- **Next.js (TypeScript):** UI and server in one project. Streamlit is weak for games and multiplayer.
- **Vercel:** hosting, deploys every merge to `main`, preview URL per pull request.
- **Neon (Postgres):** database. Two database branches: `main` for the deployed app,
  `dev` for local development.
- **iTunes Search API:** 30-second previews, no key.
- **Vitest:** tests. Never against the real database or the real API.
- **npm:** lockfile committed, exact versions.

## 4. Architecture principles
1. **The server decides:** song selection, answer checking, scoring. The browser only gets the
   preview URL and the answer options. (Prevents cheating; security criterion.)
2. **Curated song list** in Neon (artist, title, year, genre): only well-known songs, correct years,
   clean filters. The server looks up preview URLs on iTunes and caches them.
3. **Fallback:** if iTunes is unreachable or a song has no preview, the app shows a clear message or
   skips the song – it never crashes.
4. **One game core for all modes:** solo, presentation mode and duel share the same logic for rounds,
   answers and scoring. Only the screens differ.
5. **No accounts at first:** nicknames are enough. Accounts only with a concrete reason.
6. **Multiplayer via polling:** phones ask for the game state every 1–2 seconds
   (Vercel does not support long-lived WebSocket connections).
7. **Secrets never in the repository:** `.gitignore` from the first commit, `.env.example` with
   placeholders, real values only locally and in the Vercel settings.

## 5. Step by step
No timeline – a step starts when what it needs is done. Steps in the same row can run at the same time.

| Step | Person 1 (Niklas) | Person 2 | Persons 3 + 4 | Needs first |
|---|---|---|---|---|
| **0. Setup** | invite, share the `dev` string | install, run the app (README) | install, run the app (README) | – |
| **1. Specs** | spec: solo extras | spec: catalogue + modes | spec: room core | step 0 |
| **2. Basics** | high scores | 300+ songs into the seed, guess the artist | room core (together) | own spec OK'd |
| **3. On top** | error screens, phone layout | genre/decade filters, year + mixed modes | P3: presentation mode · P4: helps P3 (or starts the duel if 5 is on track) | room core merged |
| **4. Connect** | – | modes inside rooms | modes in presentation mode | steps 2 + 3 |
| **5. Optional** | typed answers | | P4: online duel | must-haves 1–5 work |
| **6. Finish** | everyone: bug fixes only, README names + student numbers, decision docs, demo rehearsal on the live URL | | | ~2 days before the deadline |

**Fixed dates:** submission **23 Nov 2026, 23:59** · presentation 24 Nov or 4 Dec.

**Rules for the steps**
- **Schema changes** (high scores, rooms, players, modes) go through Niklas, one at a time – agree in the group chat
  in which order they are merged.
- Loading 300+ songs runs `npm run db:seed` for about 18 minutes (iTunes rate limit). Fine – but only once.

## 6. Who is who
| Person | Name | Feature |
|---|---|---|
| 1 | Niklas | Solo experience. **Owner of the database schema and `CLAUDE.md`.** |
| 2 | Karin | Song catalogue & game modes |
| 3 | *decided in the group chat* | Room core, then presentation mode |
| 4 | *decided in the group chat* | Room core, then helps with presentation mode / online duel |

Team: Niklas, Jasper, Steinar, Karin. Each feature goes from UI to database; whoever builds it writes its spec,
tests and decision docs.

## 7. How to start a task
Start Claude Code in the project folder and paste:
```
Read CLAUDE.md, docs/PLAN.md, docs/course/requirements.md and specs/001-base.md.
I am Person <2/3/4>. Help me write the spec for my next step (specs/00X-<name>.md)
in the same format as specs/001-base.md: Why / What / Out of scope / Done when.
Ask me questions first. Do not write any code yet.
```
Once the spec is agreed: a new branch, then the workflow below.

## 8. Workflow for everyone
1. Update `main`, create a new branch (e.g. `feature/lobby-qr`)
2. New Claude Code session per task, point it to the spec in `specs/`
3. Tests first (Claude proposes, you read and OK them yourself), then build
4. Claude shows the test output, not just "done"
5. Click through it yourself: locally and on the pull request's Vercel preview URL
6. Open a pull request and tag a teammate as reviewer
7. When the automatic checks are green, merge it yourself. If the pull request changes tests,
   `db/schema.sql` or `CLAUDE.md`, say so in the group chat first (schema: wait for Niklas's OK)
8. The tagged teammate reviews it before the next team meeting (also after the merge); problems are
   fixed in a new small pull request
9. Stay small: merge daily rather than keeping branches open for days. One feature per branch;
   small doc fixes go along with the task they belong to, or several together in one `docs/...` branch

Details and reasons: `docs/decisions/009-review-process.md`.
Rotate reviewers so everyone knows every part. Whoever builds a feature writes its decision docs.

## 9. Folders
- `specs/` – one spec per task (Why / What / Out of scope / Done when)
- `docs/decisions/` – one file per decision: Decision, Why, Alternatives, Limits, How it could change
  (one or two sentences each)
- `docs/course/` – course requirements
- `tests/` – tests

## 10. Open questions
- Online duel: 1v1 only or more players? (only relevant if there is time for it)
- Presentation date (24 Nov or 4 Dec)

## Changelog
- 10 Nov 2026: first version
- 10 Nov 2026: review process changed – author merges after green checks, review within 24 h
  (decision 009); GitHub Action moved into the `chore/setup` branch, because merging now depends on it
- 10 Nov 2026: process simplified – no approval wait (group chat notice instead), review before the
  next team meeting instead of within 24 h, small doc fixes need no own branch, the person working
  with Claude OKs the tests, decision docs may be short (decision 009, update)
- 10 Nov 2026: stack approved by the professor; base questions decided – rounds one at a time, skipped
  rounds stored, previews looked up during `db:seed`, PGlite for database tests (spec 001, decisions 001, 004, 006, 010)
- 10 Nov 2026: a solo game has 5 rounds instead of 10; answer route also accepts "timeout" (spec 001, decision 004)
- 10 Nov 2026: base done. Releases and timeline replaced by a scope (must have 1–5, optional: duel, typed answers) and a step-by-step plan; team names added, roles decided in the group chat
