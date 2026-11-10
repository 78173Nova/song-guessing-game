# Project plan: music guessing game

Last updated: 10 Nov 2026. Change it through a pull request and add a line under "Changelog".

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

## 2. Product
A music quiz with 30-second previews of well-known songs.
- **Solo:** one player plays 5 rounds and picks the answer from 4 options.
- **Presentation mode (Kahoot style):** a big screen shows a QR code, plays the music and shows the
  leaderboard. The audience joins on their phones with a nickname and answers there.
  Tuned for a 3-minute demo (e.g. 5 short rounds).
- **Online duel:** players compete remotely, each phone plays the music itself, rounds start at
  a time set by the server.
- **Game modes:** guess the song, guess the artist; later the year and a mixed mode.

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

## 5. Releases
| Release | By | Content |
|---|---|---|
| Base (0+1) | 12 Nov | Setup + solo game online (see section 6, spec `specs/001-base.md`) |
| 2 | 16 Nov | Song catalogue (300+ songs), song/artist modes, solo polish, room core for multiplayer |
| 3 | 20 Nov | Presentation mode (big screen + QR + leaderboard), online duel, more modes |
| Feature freeze | 21 Nov, evening | Bug fixes only from here |
| Wrap-up | 23 Nov | Tests green on `main`, README, decision docs, demo rehearsal on the real URL |

## 6. Base: what must be done by 12 Nov (Niklas)
Done when one player can play a full game at the **Vercel URL**:
- [ ] Public repository, all team members invited
- [ ] `main` protected: changes only through pull requests, automatic checks must pass, no bypassing
      (see `docs/decisions/009-review-process.md`)
- [ ] `.gitignore`, `.env.example`, `CLAUDE.md`, README skeleton
- [ ] Next.js app runs locally and on Vercel
- [ ] Neon connected (`main` + `dev`), songs table, seed script with about 30 songs
- [ ] Server route "start game": 5 songs, previews via iTunes, 4 options per round
- [ ] Server route "answer": checks the answer, returns the result and points
- [ ] UI: start → clip plays → 4 buttons → right/wrong → final score
- [ ] Clear message when iTunes is unreachable
- [ ] Tests for answer checking and scoring (with fake iTunes)
- [ ] GitHub Action: runs tests and build on every pull request

### Order
1. Install: Node.js (LTS), Git, GitHub CLI (`gh`, then `gh auth login`), Claude Code
2. Create the repository on GitHub (public), invite team members, protect `main`
3. With Claude Code: create the Next.js project, `.gitignore` first, then copy this package in
4. Connect the repository to Vercel, deploy the empty app and check the URL works
5. Neon: create the `dev` branch, put connection strings into `.env.local` and into Vercel
6. Songs table + seed script
7. Game routes + UI
8. Tests (the GitHub Action already comes with step 3, see decision 009)
9. README: URL, names, student numbers, run and test commands

## 7. Task split after the base (by feature)
| Person | Feature (UI to database) |
|---|---|
| 1 – Niklas | Solo experience: results screen, high scores, error states, mobile layout. **Owner of the database schema and `CLAUDE.md`.** |
| 2 | Song catalogue & game modes: import the list, genre/decade filters, song/artist/year/mixed modes |
| 3 | Presentation mode: big-screen view, QR code, join by nickname, live leaderboard |
| 4 | Online duel: each phone plays the music, synchronised round start |

- Persons 3 + 4 **first build the room core together** by 16 Nov (create room, join, poll game state,
  server-controlled rounds). Then they split.
- Until the base is ready: person 2 builds the curated song list (no code needed),
  persons 3 + 4 write the room-core spec (`specs/002-room-core.md`).

### Timeline
| When | Person 1 | Person 2 | Persons 3 + 4 |
|---|---|---|---|
| 10–12 Nov | Base | Curate song list | Room-core spec |
| 13–16 Nov | Solo experience | Import catalogue, song/artist modes | Room core together |
| 17–20 Nov | High scores, mobile UI | Year and mixed modes, modes in multiplayer | P3 presentation mode · P4 online duel |
| 21 Nov | Feature freeze | | |
| 22–23 Nov | Everyone: bug fixes, README, docs, demo rehearsal | | |

**Hard dependencies:** base before everything else · room core before presentation mode and duel ·
schema changes only through Niklas.

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
- Answer format: multiple choice to start, maybe free text later as a separate mode
- Online duel: 1v1 only or more players?
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
