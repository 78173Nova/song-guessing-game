# Course requirements – Introduction to Programming (Nova SBE, 2026/27)

Summary of the course website, read on 10 Nov 2026.
Source (check it when in doubt): https://2477-introduction-programming.gitlab.io/wiki/
Most relevant pages: `team-project/`, `guides/`, `course-info.html`, `classes/class-4/`, `setup/`.

---

## 1. Grading overview
| Part | Weight | When |
|---|---|---|
| Team project | 40 % | Presentation in weeks 11–12 (24 Nov or 4 Dec 2026) |
| Exam | 60 % | 19 Dec 2026, 17:30 (make-up 13 Jan 2027) – 30 multiple-choice questions on the agentic workflow: planning a task, briefing an agent, judging the result |

All team members receive the same project grade.

## 2. Project scope
- Teams of 3–4. Either extend a solo project or build a **new application** (we: new application).
- Scope is open; it is judged against what 3–4 people can build in three weeks.
- The result must be deployed at a **public URL**.
- **Every member must contribute code to the repository.**
- Example directions from the course: more than one user (accounts or shared live data), external
  data (APIs), reports/exports, roles, notifications, new workflows. Combining them is fine.

## 3. Submission (by 23 Nov 2026, 23:59, on Moodle)
- Only the **link to the GitHub repository** is submitted; one member submits.
- The repository must:
  - be **public** (readable without an invitation),
  - contain **no keys or passwords**,
  - contain the code of the deployed app on the **`main` branch**,
  - include a **`README.md`** with the deployed URL, names and **student numbers** of all members,
    and the commands to run the app and its tests locally.
- **Commits after the deadline are not considered.**

## 4. Presentation
- **Live demo:** the app runs at its deployed URL in front of the class. Slides or recorded videos are
  **not** accepted as a replacement. Format otherwise free. (Our time budget: about 3 min demo + 3 min walkthrough.)
- **Repository walkthrough:** the teaching staff open the repository and ask high-level questions about
  how the project is built. **Any member can be asked about any part.**
- Example questions from the course:
  - Where is the data stored?
  - What do the tests cover, and what do they not cover?
  - What happens if the external API the app depends on is unavailable?

## 5. Grading criteria (team project)
| # | Criterion | Weight | Low (30 %) | Mid (70 %) | High (100 %) |
|---|---|---|---|---|---|
| 1 | It works | 20 % | Deployed app unavailable or crashes in main workflows | Runs, but some workflows fail or need workarounds | All workflows run without errors, **including invalid input** |
| 2 | UI/UX | 20 % | Interface does not fit the problem, confusing | Fits, but unnecessary steps or unclear feedback | Fits, direct workflows, **results and errors clearly shown** |
| 3 | Scope & ambition | 20 % | Little more than a solo project | Several features integrated into one product | **Substantial features well beyond a solo project**, implemented consistently |
| 4 | Verification | 10 % | No tests, or tests do not check the required behaviour | Main workflows covered, but not rejected actions/edge cases | **Accepted and rejected actions and edge cases** covered, **all pass on `main`** |
| 5 | Security | 10 % | Credentials in the repository, sensitive data exposed or stored insecurely | No credentials in the repo, but gaps in access control, input validation or dependencies | **Access control and input validation enforced; dependencies minimal, pinned, without known vulnerabilities** |
| 6 | Repository walkthrough | 20 % | Members cannot explain how the project is built | Explain what the parts do, but not why or their limits | Explain **how, why, the limits, and how it could change** |

**What this means for us:**
- Validate every browser input on the server (criteria 1 + 5).
- Every error situation has a visible, understandable message (criterion 2).
- Tests for "accepted" and "rejected" for every feature (criterion 4).
- `docs/decisions/` records why / limits / alternatives (criterion 6).

## 6. Stack rules
- Course default: **Python + Streamlit** (+ SQLite, pytest, uv).
- Moving away from Python is **decided case by case with the teaching staff – talk to them first**.
  The guide explicitly names games, animations, mobile layouts and live interaction between users as
  cases where Streamlit is weak. → **Get approval for Next.js.**
- Warnings from the guide: don't switch stack in the last week; don't mix two stacks without a reason;
  don't pick a stack for its looks; every member must be able to explain the stack.

## 7. Key points from the guides (checklist)

### Storing data
- Hosted Postgres (e.g. Neon) survives restarts and is shared by all users.
- **Free databases can pause after inactivity** – check/wake it before the presentation.
- Tests run against a **temporary or local** database, never the real one.
- A **seed script** keeps everyone on the same sample data.
- **One person owns the schema** – parallel schema changes conflict in ways git does not detect.
- Keep database code in one place; read the connection string from a secret (`DATABASE_URL`).

### Hosting
- Deploy early, even if the app is incomplete.
- Vercel suits JavaScript frameworks, not Streamlit.
- Common traps: "works on my laptop" (uncommitted files), secrets not set on the host,
  sleeping app at the start of the demo (open the URL beforehand), old version deployed
  (check that the host deploys from `main`).

### External APIs
- Check first: key needed? Limits? How fresh must the data be? Terms of use (storing allowed? attribution?)
- **Decide and test the failure behaviour** – last saved value, clear message, or disable the feature.
  Crashing is not an option. The fallback is part of the demo.
- Keep all API calls in one module, with a timeout.
- **Tests never call the real API** (fake responses).
- Cache responses instead of calling on every interaction (rate limits).

### Real-time / multiplayer
- Options: manual refresh, **polling** (every few seconds), real-time features of a backend service,
  WebSockets (need a host that allows open connections), hosted real-time services (Ably, Pusher).
- Shared state must live in **shared storage** (database), not in one user's session.
- **Define a rule for simultaneous actions** (who wins?) – it becomes a test.
- Always test with **two browsers/devices**, and on the deployed app, not only locally.

### User accounts
- Accounts only when users have their own data or different permissions.
- **Hiding a button is not a permission** – check permissions where the action happens (server).
- Don't store passwords yourself; use a provider.
- Prepare demo accounts per role and test them on the deployed app.

### Secrets
- Secrets: API keys, connection strings, passwords, tokens. **Not** secrets: app URL, names of services, sample data.
- Locally in `.env` (in `.gitignore`), on the host in its settings, `.env.example` with placeholders in the
  repo, real values shared only privately.
- **Add `.gitignore` before creating the secrets file**; anything committed stays in the history.
- After a leak: revoke the key at the provider immediately and create a new one (deleting the commit is not
  enough), update it locally and on the host, check the usage page.
- No keys in chats, issues or agent conversations; close dashboards before screen sharing.
- Give the agent only the minimum access it needs.

### Coding agents
- Claude Code reads `CLAUDE.md` (the course otherwise uses `AGENTS.md`). Rules live in the project, not in
  people's heads: run and test commands, branch rule, what the agent must never do (e.g. edit tests).
- Never two agents in the same folder at once; commit before switching.
- Never accept changes unread – agents edit tests, touch unrelated files, or claim success without evidence.

### Working as a team
- **Splitting by feature** fits agentic work best (one person briefs an agent on a complete workflow).
  Splitting by layer means each member only understands their layer.
- Shared files (schema, `CLAUDE.md`) have an owner.
- Every change is reviewed by a second person before `main`: does it do what was asked? Do tests cover it
  (including rejected actions)? Does it touch anything outside its scope, especially tests?
- Short-lived branches, small frequent merges. Whoever merges owns the result.
- Track work, e.g. with GitHub issues (linkable to pull requests).
- `CLAUDE.md` is changed through pull requests like code.

## 8. Course method (classes 4–5) – also exam material
- **Three standards:** rules (`CLAUDE.md`/`AGENTS.md`), judge (tests), loop (agent works until tests pass).
- **One spec per task** with four sections:
  - *Why* – intent; decides when something can be read two ways
  - *What* – checklist, one line per thing that must be true
  - *Out of scope* – the fence for this task
  - *Done when* – the finish line in plain words
- **Define done before building:** tests first, reviewed by a human.
- **Never edit tests to make them pass.** A wrong test is corrected explicitly against the requirement.
- Ask for **test output, not a sentence**. Read red output from the bottom.
- Green is not the end: read the diff, click through the app (some "Done when" lines have no test).
- One task per branch, a new agent session per task.
- If the same failure comes back twice: stop, read it yourself, start a new session with a better ask.
- When the agent does something unwanted: add a rule to `CLAUDE.md` instead of writing longer prompts.
- Git flow: `main` is the trusted version → branch → small commits with clear messages → push →
  pull request → review → merge.

## 9. Likely walkthrough questions for our project
(Answers belong in `docs/decisions/`.)
- Where is the data stored, and what data is there?
- Why Next.js instead of Streamlit? What did it cost?
- What happens if the iTunes API is unreachable or a preview is missing?
- How do you make sure only well-known songs appear?
- Why does the server check answers instead of the browser? Can players cheat?
- How does multiplayer work technically? Why polling? How big is the delay?
- What happens when two players answer at the same time / someone loses the connection / joins late?
- What do the tests cover, and what not?
- Where are the secrets? What would you do after a leak?
- Why no accounts?
- What are the app's limits (player count, free-plan limits, Apple's terms of use)?
- How would you change the app if it had 10,000 users?

## 10. Dates
| What | When |
|---|---|
| Repository link submission | by 23 Nov 2026, 23:59 |
| Presentations (part 1/2) | 24 Nov 2026 |
| Presentations (part 2/2) | 4 Dec 2026 |
| Exam | 19 Dec 2026, 17:30 |
| Make-up exam | 13 Jan 2027, 16:00 |

Teaching staff: Cláudio Vieira, Luís Carvalho, Paulo Marques (email addresses on the course website).
