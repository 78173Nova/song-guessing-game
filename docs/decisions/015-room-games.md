# 015 – Room games: server-paced rounds, clips on every device

Date: 16 Nov 2026 · Status: decided, built (issue #33)

## Decision
- **The server paces the game.** Start schedules round 1 to start **5 s** later. A round closes when every
  player has answered or **15 s** after its start, whichever comes first. The next round starts **8 s** after
  that close: 5 s for the result, then "Next round starting…". Nobody taps "Next"; the creator-only route
  `POST /api/rooms/[code]/next` is gone.
- **Everything is worked out from timestamps** on each state request (`bringUpToDate` in `lib/api/rooms.ts`):
  the close moment is the last answer if everyone answered, otherwise the end of the 15 s, and the next start
  time is that moment + 8 s. If nobody asked for a while, the request catches up over several rounds at once.
  A scheduled round is stored as `open` with a `started_at` in the future, so no schema change was needed.
- **Every device plays the clips.** Every player gets the 5 clip addresses after Start and loads them in
  advance (load, then try once more, like the solo game). The state says `serverNow` and `nextRound` (number,
  start time, options); the page measures how far its clock is off and starts the clip at the start time. A
  device that is late joins in mid-clip. If the browser refuses to play without a tap, it shows
  "Tap to hear the music".
- **Scoring is the solo scoring:** 100 for a right answer plus up to 50 for speed, counted from the round's
  start time. No answer = 0 points. Answers before the start time ("round-not-open"), after 15 s ("too-late"),
  a second answer and other rooms' tokens are refused.
- **Each player's own result** (right answer, right/wrong, points) shows for 5 s from when the device first
  sees it. "Tap to continue" skips it on that device only. After the last round everyone sees the
  **standings**; equal points share a rank (1, 1, 3). The `standings` replace the creator-only `scoreboard`.
- **Which screen shows** is worked out in `lib/client/room-game.ts` from the newest reply and the local clock,
  every 100 ms, so a round starts on time even between two polls. A reply that arrives after a newer one is
  ignored.

## Why
- **Server-paced:** every player is on their own device and the room creator plays too, so nobody should have
  to run the game. It also makes the duel and the multiplayer room the same thing.
- **Timestamps, not a timer:** Vercel has no background jobs (decision 008). Working the times out from the
  stored answers gives every request the same answer, so two requests at the same moment cannot schedule a
  round twice or at two different times.
- **5 s and 8 s:** a device polls once a second and then needs a moment to start the clip; a few seconds of
  lead mean every device knows the start time before it comes.
- **Options before the start time:** they do not give the answer away (the right one is mixed in with three
  others), and the buttons can appear exactly when the clip starts instead of one poll later.

## Alternatives
- **Room creator taps "Next"** (decision 012, update 15 Nov): simple, but the creator plays too and would
  control the pace for everyone.
- **A real-time service** to push "start now" to every device: more exact, but another service and key
  (decision 008).
- **Measure the clock offset with several round trips** (like NTP): more exact, but more code for a quiz where
  a few hundred milliseconds do not matter.

## Limits
- The clock offset ignores how long a reply takes to travel, so devices can be off by that much (usually well
  under a second).
- A clip that will not load on one device stays silent there; swapping songs in rooms comes with #41.
- A player whose device is closed still counts as "not answered", so each round waits the full 15 s for them.
  "Away" comes with #40.
- A phone that reloads mid-game needs one tap before the music plays again (browsers block sound without a tap).

- The 5 s of result count from when a device first sees the closed round. A device that sees it late (slow
  connection) gets a shorter result, because the next round still starts 8 s after the close on the server.
- An answer that arrives just before the 15 s are up can still be refused as "too late" if another request closes
  the round in the same moment, before the answer is saved.
- All 5 clip addresses arrive at Start, so a curious player could listen to a later clip in the network tab
  before its round. The address contains no title, and the answer itself is never sent early.
- The clip code in `components/Room.tsx` (loading and playing at the start time) has no automated tests; it
  needs a real browser. It is checked by hand with two browsers.

## How it could change
- The delays are three numbers in `lib/game/rooms.ts` (`FIRST_ROUND_DELAY_SECONDS`, `RESULT_SECONDS`,
  `NEXT_ROUND_DELAY_SECONDS`).
- Sets and set summaries (#34) would add a pause with the standings after each set by giving the first round
  of the next set a later start time.
