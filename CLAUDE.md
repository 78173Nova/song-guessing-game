# CLAUDE.md – Music guessing game (team project, "Introduction to Programming")

Claude Code reads this file at the start of every session. It applies to all four team members.
Details live in `docs/` – read the relevant files when a task needs them.

## The project in two sentences
A browser music quiz: players hear 30-second previews of well-known songs and guess them
(e.g. title or artist). We start with a solo game; later come a Kahoot-style presentation mode
(big screen plays the music, phones answer, join via QR code) and an online duel.

Course project: the public repository is submitted on **23 Nov 2026, 23:59**. Grading covers
functionality, UI, scope, tests, security, and whether the team can explain every decision.
The team are **programming beginners**: explain proposals in plain language before implementing them.

## Key documents
- `docs/PLAN.md` – plan, releases, task split, workflow
- `docs/course/requirements.md` – all course requirements and grading criteria
- `docs/decisions/` – decisions made (Decision / Why / Alternatives / Limits / How it could change)
- `docs/reference/` – earlier prototype (README + notes on what we keep and change), ideas only
- `specs/` – one spec per task (Why / What / Out of scope / Done when)

## Stack
- Next.js 16 (App Router) with TypeScript – UI and server routes in one project.
  This version differs from older Next.js: read `AGENTS.md` and the docs in
  `node_modules/next/dist/docs/` before writing Next.js code.
- Node.js 24 (LTS) in the GitHub Action and on Vercel
- Hosting: Vercel (deploys `main` automatically, preview URL per pull request)
- Database: Neon Postgres via `@neondatabase/serverless`, connection from `DATABASE_URL`
- Music: iTunes Search API (no key) for preview URLs
- Tests: Vitest
- Package manager: npm. Install packages with exact versions (`npm install --save-exact`;
  `.npmrc` sets this by default), commit `package-lock.json`. Keep dependencies to a minimum.
  Run `npm audit` after installing; it must report 0 vulnerabilities.
- `package.json` "overrides": forces `minimatch` 11.0.6 inside the lint tooling, because
  `typescript-eslint` still asks for a version with a known vulnerability. Remove it once
  `typescript-eslint` depends on a fixed version.

## Commands
(Keep this list up to date.)
- Run the app locally: `npm run dev` (then open http://localhost:3000)
- Tests: `npm test` (runs once; tests live in `tests/` and end in `.test.ts`)
- Lint: `npm run lint`
- Check the build: `npm run build`
- Create tables and load sample songs: `npm run db:seed` (added in the `feature/database` branch)
- CI: `.github/workflows/ci.yml` runs `npm ci`, lint, tests and build on every pull request

## Folder structure
- `app/` – pages and server routes (`app/api/...`)
- `components/` – reusable UI pieces
- `lib/game/` – game logic with no database or network access (build rounds, check answers, score) – easy to test
- `lib/music/` – everything about the iTunes API (call, cache, error handling) – the only place that calls iTunes
- `lib/db/` – all database code – the only place with SQL
- `db/` – schema (`schema.sql`), seed script and song list
- `tests/` – tests
- `specs/`, `docs/` – specs and documentation

## Rules
1. **Branches:** every task on its own branch (`feature/...`, `fix/...`, `docs/...`).
   Never commit or push to `main` directly. One task per branch.
2. **Tests first:** for a new feature, propose the tests first and let a human review them,
   then build. Test accepted **and** rejected actions as well as edge cases.
3. **Never change tests to make them pass.** If a test looks wrong, say so and stop.
4. **Proof, not claims:** at the end of a task run `npm test`, show the output and list every
   changed file. Also say how to check the change in the running app.
5. **The server decides:** song selection, answer checking and scoring happen on the server.
   The browser never receives the correct answer before the player has answered.
   Every input from the browser is validated on the server (type, length, allowed values).
6. **Secrets:** no keys, passwords or connection strings in code. Read values from environment
   variables only. Never read, create, edit or commit `.env*` files (except `.env.example`).
   Add new variables with a placeholder to `.env.example` and tell the human.
7. **External API:** call iTunes only through `lib/music/`, with a timeout, a cache and a clear
   message for the user. The app must never crash when the API fails.
8. **Tests stay offline:** tests never call the real iTunes API or the real Neon database.
   Use fake responses and a temporary test database.
9. **Database schema:** table changes only after agreement with Niklas (schema owner).
   Point it out when a task needs a schema change.
10. **Keep the docs current:** when something is decided or changed, add or update the matching
    file in `docs/decisions/` on the same branch (do not delete the old reasoning; append
    "Update <date>: …"). When commands or structure change, update this file.
11. **Stay small:** change only what the task asks for. No side refactors, no unnecessary packages.
    When unsure, ask instead of guessing.
12. **Git:** commit messages say what changed ("Move answer checking to the server", not "update").
    Open pull requests with `gh pr create`; the description covers what, why, test output and how
    to check it. Merging (see `docs/decisions/009-review-process.md`): the author merges once the
    automatic checks are green and tags a teammate, who reviews within 24 hours. Pull requests that
    change tests, `db/schema.sql` or `CLAUDE.md` wait for a human approval before merging.
    Claude never merges a pull request itself.
13. **Language:** code, comments, commit messages, pull requests and all documentation in English.

## When something goes wrong
If the same error comes back twice: stop, explain the error in plain language and propose a
new approach instead of trying more variations.
