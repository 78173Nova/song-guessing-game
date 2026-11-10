# 007 – No accounts, nicknames only

Date: 10 Nov 2026 · Status: decided (for now – revisit after the multiplayer works)

## Decision
There is no login. Solo players start straight away. In multiplayer, players join a room with a
**nickname**. The server gives each player a random, hard-to-guess player token when they join; the
browser sends it with every answer, and the server checks that the token belongs to that room.

## Why
- The course guide: accounts are only needed when users have their own data or different permissions.
  For a quiz, a nickname is enough.
- **Demo in 3 minutes:** the audience must join within seconds. Sign-up or login would kill the demo.
- Login is much work (provider setup, local testing, demo accounts) and adds a dependency.
- The player token still gives us **access control**: you can only answer for yourself, only in your room.

## Alternatives
- **Login with Google/GitHub (e.g. Auth.js, Clerk):** personal history and stats, but slower joining and more setup.
- **Own username/password system:** easy to get wrong; passwords must never be stored in plain text. Not worth it.
- **Shared password for the whole app:** no benefit for us.

## Limits
- No personal history across games; high scores are tied to a nickname, not a person.
- Nicknames are not unique worldwide; within a room the server rejects duplicates.
- Nicknames are user input: the server limits length and characters and the UI escapes them.

## How it could change
If we add features that need identity (e.g. personal statistics, friend lists), a login provider can be
added and linked to the existing player records.
