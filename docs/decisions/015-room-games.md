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
- A clip that will not load on one device stays silent there; swapping songs in rooms comes with #41
  (see the update below).
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

## Update 17 Nov 2026: room settings and sets (issue #34)
- **Decision:** the room creator chooses the room settings when creating the room: room type (Duel = exactly 2
  players, Multiplayer = 2–25), mode (title / artist / year / mixed), genres and decades ("Any" or one or more
  tiles), songs per set (3 / 5 / 10) and number of sets (1 / 2 / 3). They are stored on the room (`rooms.room_type`,
  `mode`, `genres`, `decades`, `songs_per_set`, `sets`; an empty list = Any) and never change. A song plays if it
  matches one of the genres **and** one of the decades. The game has sets × songs per set rounds, no song twice.
- **Why fixed at creation:** players join knowing what they get, and the server never has to handle a game whose
  rules change in the lobby. Too few matching songs is refused at creation with the count ("Only 18 songs
  match …"), and the create form shows the count while choosing (`GET /api/rooms/matching-songs`).
- **A full room starts by itself:** the join that fills the last seat (2 in a Duel, 25 in Multiplayer) starts the
  game exactly like "Start now". A Duel therefore always starts when the second player joins.
- **Sets:** after the last round of a set the next round starts 23 s after the close instead of 8 s (result 5 s +
  set summary 10 s + standings 5 s + 3 s), the same way as before: one later start time, no timer. Every state
  reply has `me.summary` (each closed round: title, artist, right/wrong, points, iTunes link). The page shows a
  set's part after each set and all of it at the end, after 5 s of final standings. "Tap to continue" skips each
  screen on that device only.
- **Limits:** the next set starts at the same server time for everyone, so a player who skips the summary waits on
  "Next round starting…". A swapped song (#41) also matches the genres and decades and keeps the round's
  question type. Rooms created without settings (older screens) get Multiplayer, title, Any, 1 set of 5.
- **How it could change:** the pauses are `SET_SUMMARY_SECONDS`, `SET_STANDINGS_SECONDS` and
  `FINAL_STANDINGS_SECONDS` in `lib/game/rooms.ts`; the choices are lists in `lib/game/room-settings.ts`.
## Update 17 Nov 2026: song swap in rooms (issue #41)
- **Decision:** every device loads the clips in advance. If a clip will not load (load, try once more), the device
  reports it with `POST /api/rooms/[code]/replace` `{ round }`. Any player of the room may report, but only before
  the round starts. The server gives the round another song that matches the room's settings and is not in the
  game yet (like the solo replace), and every device sees the new clip in `previewUrls` and loads only that one.
  **At most one swap per round** (column `rounds.swapped`): a second report is refused with "already-swapped".
  If the report comes less than 5 s (`SWAP_LOAD_SECONDS`) before the round's start, the round starts 5 s after
  the report instead, so it moves back by at most 5 s. If the clip still fails, the round plays anyway; only that
  device shows "Couldn't play the clip" and the player can still answer.
- **Why one swap:** in a room one device's report changes the song for everyone. Without a limit a player could
  report failures again and again to skip songs they do not know. One swap fixes the usual case (one dead clip),
  and a dead replacement is rare. **Why 5 s:** like the 5 s before round 1, it gives every device a few polls to
  see the new clip and start loading it.
- **Alternatives:** only the creator may report (the rule before #41): but every device can fail, not only the
  creator's. Up to 3 swaps like the solo game: too easy to skip songs. Each device plays a different song: the
  round would not be the same quiz for everyone.
- **Limits:** a device whose clip failed for a reason only it has (slow connection) still swaps the song for
  everyone. A report in the last 5 s before a round delays it for everyone. The clip loading in
  `components/Room.tsx` has no automated tests (it needs a real browser); `couldNotPlay` and `clipsToLoad` in
  `lib/client/room-game.ts` are tested.

## Update 17 Nov 2026: QR code in the share pop-up (#42)
- **Decision:** the share pop-up shows a QR code of the join link, drawn on the device with the `qrcode` package
  (1.5.4, plus `@types/qrcode` 1.5.6 for TypeScript). It turns the link into an SVG picture, shown with a plain `<img>`.
- **Why:** players in the same place can join by pointing their phone camera at the screen instead of typing a link.
  A QR code has error correction and masking rules that are too much to write and test ourselves; `qrcode` is the
  most used package for it, has no outside service and `npm audit` reports 0 vulnerabilities with it.
- **Alternatives:** an online QR service (an `<img>` pointing to another site) – needs no package, but sends every
  room link to a third party and fails without that site; writing the QR encoder ourselves – too much code.
- **Limits:** the package adds about 25 small packages to `node_modules` (mostly for its command-line tool, which we
  do not use). Scanning with a real phone is checked by hand; the tests only check that the picture is the QR code of
  the right link.
- **How it could change:** the drawing sits in `roomJoinQrCode` in `lib/client/share.ts`; another package would only
  change that function.
