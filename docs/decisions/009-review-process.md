# 009 – Review process: automatic checks before merging, human review after

Date: 10 Nov 2026 · Status: decided

## Decision
Every change still reaches `main` through a pull request, but GitHub does **not** wait for a human approval.
Instead, the **automatic checks** (the GitHub Action: lint, tests, build) must pass before anyone can merge.

- **Author merges** their own pull request once the checks are green.
- The author **tags a teammate** in the pull request. That teammate reviews it **within 24 hours**,
  also after it was merged. Problems found in review are fixed in a new, small pull request.
- **Exception – these wait for a human approval before merging:** pull requests that change
  - tests (`tests/` or any `*.test.ts` file),
  - the database schema (`db/schema.sql`) – approval by Niklas (schema owner); if Niklas is the author, any teammate,
  - `CLAUDE.md`.
- **Nobody can bypass the checks**, including the repository owner.

GitHub settings for `main` (Settings → Branches → branch protection rule):
- "Require a pull request before merging": on, **required approvals: 0**
- "Require status checks to pass before merging": on, select the GitHub Action's job
  (it only appears in the list after the Action has run once)
- "Do not allow bypassing the above settings": on

## Why
- **Nobody gets stuck.** Four people, three weeks, and a base due in two days: waiting hours for an approval
  on every small pull request would slow the whole team down.
- **Broken code still cannot reach `main`.** A machine checks every single change before it is merged, so
  the deployed app (Vercel deploys `main`) always passes lint, tests and build.
- **Every change is still seen by a second person** – just shortly after the merge instead of before.
  Rotating the reviewer keeps everyone familiar with every part (needed for the walkthrough).
- **The exceptions protect the "judge".** Tests decide whether code is correct. An agent that quietly edits a
  test to make it pass would get through the automatic checks, so test changes need human eyes first.
  Schema and `CLAUDE.md` changes affect everyone and are hard to undo.

## Alternatives
- **1 approval required for every pull request** (the original plan, and what the course guide describes):
  safest, but every change waits for someone to be available.
- **Strict only in some phases** (e.g. relaxed during the base, strict from the feature freeze): simple, but the
  rule changes mid-project and is easy to forget.
- **Fixed review buddies with a time limit** ("review within 3 hours, or the author may merge"): keeps
  review before merging, but depends on people being reachable.

## Limits
- The course guide says every change is reviewed by a second person **before** `main`. We review **after**
  merging for most changes – we must be able to explain why (see "Why").
- A mistake the tests do not catch can be live on the Vercel URL for up to a day until the review finds it.
- The exceptions (tests, schema, `CLAUDE.md`) are a **team agreement**, not enforced by GitHub.
- The automatic checks are only as good as the tests: green does not mean the feature works as intended.
  Clicking through the Vercel preview URL is still part of every pull request.

## How it could change
- The exceptions could be enforced by GitHub with a `CODEOWNERS` file plus "Require review from Code Owners".
- From the feature freeze (21 Nov) we could switch back to "1 approval required" to protect the demo version.

## Update 10 Nov 2026: simpler process
The rules above felt too heavy for a four-person course project with three weeks left. Changed:
- **No approval wait.** Pull requests that change tests, `db/schema.sql` or `CLAUDE.md` no longer wait
  for an approval on GitHub. The author says so in the group chat before merging; schema changes still
  need Niklas's OK there. It was a team agreement before as well (not enforced by GitHub), so the
  protection is about the same, and nobody has to wait for a click.
- **Review before the next team meeting** instead of within 24 hours. The goal stays the same:
  everyone knows every part for the walkthrough, without daily time pressure.
- **Small doc fixes need no own branch.** They go into the branch of the task they belong to, or
  several together into one `docs/...` branch. Features still get one branch each.
- **Tests first stays, but the person working with Claude OKs the tests** – no teammate needed.
  "Never change tests to make them pass" (rule 3 in `CLAUDE.md`) is unchanged.
- **Decision docs keep their five sections, one or two sentences each.**

Unchanged: pull request required for `main`, automatic checks must pass, nobody can bypass,
no secrets in code, the server checks answers, tests stay offline.

Limit: a test change by an agent is now only caught if the author really reads the diff and the
chat notice is not skipped. Reviewers should look at test changes first.

## Update 14 Nov 2026: no schema approval
Schema changes no longer need Niklas's OK, and a pull request that changes `db/schema.sql` needs no
group-chat notice. Anyone may change the schema. The notice for test and `CLAUDE.md` changes stays.
Why: waiting for one person slowed the team down, and everyone works with the same rules and tools.
Limit: two branches changing the schema at the same time can conflict in the shared `dev` database
without git noticing (see decision 003).

## Update 17 Nov 2026: more automatic checks
- **Type check in CI** (`npm run typecheck`). Vitest runs tests without checking types, so a type error in a
  test only showed up in the build (commit 451c0c3). Now it is reported on its own, and agents run it with the tests.
- **Folder rules in lint** (`eslint.config.mjs`). The folder rules in `CLAUDE.md` ("only `lib/db` has SQL",
  "`lib/game` and `lib/accounts` have no database or network", "only `lib/music` calls iTunes, only `lib/email`
  sends emails") were written down only; now `npm run lint` fails when code breaks them. Lint also stops browser
  code (`components/`, `lib/client/`) from importing server folders, and server code (`app/api/`, `lib/api/`,
  `lib/db/`, `db/`) from calling `fetch` itself.
- **LF line endings for everyone** (`.gitattributes`). Git on Windows checked files out with `\r\n`, which broke
  the schema loader once (commit b00a5fa).
Why: each check replaces a rule someone had to remember, and each one answers a mistake that already happened
or a rule that matters for security. Limit: lint sees imports and calls by name, not what the code means. The SQL
rule flags any method called `query` or `transaction` outside `lib/db`, and lint cannot tell whether a value sent
to the browser contains the correct answer; that stays a review question.
