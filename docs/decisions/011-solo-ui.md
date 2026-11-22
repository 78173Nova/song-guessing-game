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

## Update 10 Nov 2026: get ready, preloaded clips, one start moment
- The start reply carries all clip addresses (decision 004, update). One audio player per round is created and
  "unlocked" during the Start tap. The game waits only for clip 1 ("Loading first song…" – no fixed time), then
  shows 3 – 2 – 1. Clips 2–5 load one after another in the background.
- A round starts by asking the server for it first, then starting the already loaded clip and showing the
  buttons together. Measured in Chrome: clip and buttons appear within ~0.1 s of each other.
- Clips that will not load: retry → swap the song → give up (`lib/client/clip-loader.ts`, decision 006).
  Browsers that cannot play AAC at all (e.g. the VS Code built-in browser) get a clear message before a game starts.
- Limits: the server's 15 seconds start when the request arrives, so the reply's travel time (about 0.1–0.3 s)
  counts against the player. If a phone still refuses to start round 1's sound, a "▶ Tap to start" button
  appears; the server's clock is already running then.

## Update 22 Nov 2026: "Leave game" during a game
- Decision: a quiet "Leave game" button under the answers, on every screen from "Loading first song…" to the
  reveal. Tapping it shows a question in its place ("Leave this game? Your points from this game are lost.",
  Leave / Keep playing); the game keeps running meanwhile. Leave stops the music and brings back the start screen
  with mode, genre and decade still chosen (team feedback 22 Nov, point 2).
- Why: a player who picked the wrong settings had to finish all 5 rounds or reload the page. The question stops a
  mistaken tap from throwing a game away.
- Alternatives: the browser's own pop-up (`window.confirm`, as rooms use) – tried first, but in Safari the clip
  sometimes went silent while it was open, and it freezes the page's timers. Naming it "New game" (sounds like an
  instant restart with the same settings, which is what "Play again" does; GLOSSARY.md avoids the term) or putting
  it in the header (easy to miss, far from the thumb).
- Limits: the left game stays unfinished on the server, the same as closing the tab. "← Home" still leaves without
  asking. Late replies of the left game are ignored: errors now carry the game's ID like clip replies do. Rooms
  still use the browser's pop-up for Leave and Kick; they could switch to the same question later.
