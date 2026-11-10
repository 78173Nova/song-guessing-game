# Start here

How to use this starter package. You can delete this file once the base is merged.

## For Niklas (setting up the repository)

### 1. Before Claude Code
1. Install Node.js (LTS), Git, GitHub CLI (`gh`) and Claude Code. Run `gh auth login`.
2. On github.com: create a **public** repository, then Settings → Collaborators → add the three teammates.
3. Settings → Branches → add a rule for `main` (see `docs/decisions/009-review-process.md`):
   require a pull request (0 approvals), require the GitHub Action's checks to pass, do not allow bypassing.
   (Do this after the first commit, otherwise there is nothing to protect yet. The checks can only be
   selected after the GitHub Action has run once – add that setting after the `chore/setup` pull request.)
4. Clone the repository to your computer and open the folder in a terminal.
5. Copy the contents of this package into the repository folder (`CLAUDE.md`, `docs/`, `specs/`, this file).

### 2. First Claude Code session (planning only)
Start `claude` in the repository folder and paste:

```
Read CLAUDE.md, docs/PLAN.md, docs/course/requirements.md, the files in docs/decisions/ and specs/001-base.md.
Then:
1. Summarise in 5 bullet points what we are building and what the base must deliver.
2. Propose the exact steps for the first branch (chore/setup): which commands you will run,
   which files you will create, and in which order. .gitignore must come before anything else.
3. List anything in the spec that is unclear or that you would decide differently, with a reason.
Do not create or change any files yet.
```

Read the answer, ask questions, correct what you disagree with. Then:

```
Go ahead with the chore/setup branch as agreed. Stop after each step that installs packages
or creates config files and show me what you did. When the branch is ready, run the tests and
the build, show the output, and open a pull request with gh.
```

### 3. Things only you can do (Claude Code cannot click these for you)
- Vercel: "Add New Project" → import the GitHub repository → deploy.
- Neon: create the `dev` branch; copy both connection strings.
- Put the `dev` connection string into `.env.local` **yourself** (Claude must not read or write `.env` files).
- Vercel → Project → Settings → Environment Variables: add `DATABASE_URL` with the `main` connection string.
- Never paste connection strings into the Claude Code chat or the team chat; share them privately.

### 4. Every further step
One branch per step from "Suggested order" in `specs/001-base.md`, a **new** Claude Code session each time:

```
We are working on specs/001-base.md, step <n>: <branch name>.
Create the branch from an up-to-date main. Propose the tests first and wait for my OK.
Then implement until the tests pass, show the final test output, list the changed files,
tell me how to check it in the app, and open a pull request.
```

## For the other team members
1. Install Node.js (LTS), Git, GitHub CLI (`gh auth login`) and Claude Code.
2. Accept the GitHub invitation, clone the repository, run `npm install`.
3. Ask Niklas privately for the `dev` database connection string; copy `.env.example` to `.env.local` and fill it in.
4. `npm run dev` should start the app; `npm test` should pass.
5. Read `docs/PLAN.md` (your feature and the timeline) and `docs/course/requirements.md`.
6. Until the base is ready:
   - **Person 2:** build the curated song list (300+ well-known songs: artist, title, original year, genre)
     as a CSV. Claude can draft it; you check it.
   - **Persons 3 + 4:** write `specs/002-room-core.md` (create room, join with nickname, poll state,
     rounds controlled by the server, what happens on late join / disconnect / simultaneous answers).
