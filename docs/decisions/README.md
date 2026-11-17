# Decisions

Each file describes one decision in five sections:
**Decision · Why · Alternatives · Limits · How it could change.**
One or two sentences per section are enough.

That is exactly what the "repository walkthrough" criterion asks for at full marks
(how it is built, why, its limits, and how it could change). It is also our study material for the presentation.

Rules:
- Whoever builds a feature writes or updates the matching decisions in the same pull request.
- When a decision changes, nothing is deleted: append "Update <date>: what and why" at the bottom.
- New file = next number, short name, e.g. `009-free-text-answers.md`.

| No. | Decision | Status |
|---|---|---|
| 001 | [Stack: Next.js instead of Streamlit](001-stack.md) | decided, approved by the professor |
| 002 | [Hosting on Vercel](002-hosting.md) | decided |
| 003 | [Database: Neon Postgres](003-database.md) | decided |
| 004 | [The server checks answers](004-server-checks-answers.md) | decided |
| 005 | [Curated song list](005-curated-song-list.md) | decided |
| 006 | [Behaviour when the API fails](006-api-failure.md) | decided |
| 007 | [No accounts, nicknames only](007-no-accounts.md) | decided, updated 15 Nov 2026 (accounts to create rooms) |
| 008 | [Polling instead of WebSockets](008-polling.md) | decided, built with the room core; updated 16 Nov 2026 (shared start time, server-paced) |
| 009 | [Review process: checks before merging, review after](009-review-process.md) | decided |
| 010 | [Test database: PGlite](010-test-database.md) | decided |
| 011 | [Solo game screens: logic outside the screen code](011-solo-ui.md) | decided |
| 012 | [Rooms: tables, tokens, codes and the player limit](012-rooms.md) | decided, built (room core, away/kick/leave, several games per room, public rooms and the lobby countdown; updated 17 Nov 2026) |
| 013 | [Game modes: title, artist, year, mixed](013-game-modes.md) | decided, partly built |
| 014 | [Accounts](014-accounts.md) | decided, mostly built (sign-up, verification, login, password reset, avatars and Account settings, changing username/email/password; updated 17 Nov 2026; Brevo email delivery #25) |
| 015 | [Room games: server-paced rounds, clips on every device](015-room-games.md) | decided, built (issue #33; updated 17 Nov 2026: room settings and sets, song swap, QR code, several games per room) |
