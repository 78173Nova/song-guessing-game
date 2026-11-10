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
