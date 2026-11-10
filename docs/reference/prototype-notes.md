# Prototype: what we keep and what we change

`prototype-README.md` (next to this file) is the README of a single-file prototype a team member built
before the project started. **It is a source of ideas, not code to copy.**

## What we keep (as ideas)
- **iTunes Search API** for 30-second previews: no key, previews and artwork included.
- **Respecting Apple's terms:** stream previews only, never download or store the audio; show
  "Previews provided courtesy of iTunes" and link each revealed song to Apple Music.
- **Rate-limit protection:** about 20 calls per minute → space out calls and cache results.
- **Cleaning up titles** (e.g. remove "(Remastered 2011)") and filtering out karaoke, live and remix versions.
- **Specific error messages** per failure type (offline, slow, rate-limited, preview blocked).
- **Scoring idea:** 100 for a correct answer, speed bonus up to +50, streak bonus. To be confirmed in the spec.
- **Countdown that starts when the music actually starts**, and audio unlocked by the "Start" tap on iPhone.
- **Keyboard shortcuts** (1–4 to answer) as a nice touch for later.

## What we change, and why
| Prototype | Our app | Why |
|---|---|---|
| Everything runs in the browser, which knows the answer | Server picks songs, checks answers and scores | Cheating in multiplayer; security criterion (decision 004) |
| Songs found by searching seed artists | Curated list of well-known songs in the database | Only famous songs, correct years, clean filters (decision 005) |
| MusicBrainz for release years | Year stored in our song list | One fewer API that can fail (decision 005) |
| Cache in the browser's `localStorage` | Cache in Neon, shared by everyone | Works for all users and survives restarts (decisions 003, 006) |
| Calls straight from the browser (with a JSONP fallback) | Calls only from our server (`lib/music/`) | One place for timeout, cache, rate limit and tests (decision 006) |
| One HTML file | Next.js project with separate folders for UI, game logic, music API and database | Four people can work in parallel; each part is testable |
| Single player only | Solo, presentation mode, online duel | Scope criterion; demo |
| Playwright end-to-end tests | Vitest unit tests first; end-to-end tests possibly later | Fast tests for the rules (accepted and rejected actions) |
