# 011 – Solo game screens: logic outside the screen code

Date: 10 Nov 2026 · Status: decided

## Decision
The solo game is one browser component (`components/SoloGame.tsx`) that only shows screens and reports clicks.
What happens on each click is decided by one plain function, `gameReducer` in `lib/client/game-state.ts`,
and all server calls go through `lib/client/game-api.ts`, which returns data or a readable message and never throws.
The 15-second countdown in the browser is only a display: the server measures the real time (decision 004).
When it reaches 0, the browser sends `"timeout"`; when a clip fails to load, it sends `"skip"`.

## Why
- The rules for screens (double clicks ignored, late replies ignored, what comes after round 5) can be tested
  without a browser – the same idea as `lib/game/` on the server.
- One place for error messages means the player always sees a clear sentence, never a crash.

## Alternatives
- **All logic inside the component:** fewer files, but nothing of it could be tested with Vitest.
- **A UI library or state library:** more features, but extra packages to learn and keep up to date.

## Limits
- Audio, layout and looks are checked by hand (laptop + phone), not by tests.
- Phones only play sound that starts from a tap. Start/Next play a tiny silent sound to "unlock" the player;
  if the browser still refuses, a "▶ Play clip" button appears. The countdown keeps running meanwhile.
- After a network error the game cannot be resumed; "Try again" starts a new game.

## How it could change
Browser tests (e.g. Playwright) could click through the screens automatically. The countdown could start when
the clip actually starts playing instead of when the round arrives.
