# 004 – The server picks the songs and checks the answers

Date: 10 Nov 2026 · Status: decided

## Decision
Song selection, wrong answer options, answer checking and scoring happen on the server.
For each round the browser only receives a round ID, the preview URL and four answer options –
**never the correct answer** before the player has answered. Only the answer route returns whether the
answer was right, what the solution was and how many points were earned.

Every input from the browser is validated on the server: does this game and round exist, does it belong to
this player, is the chosen option one of the four, was the round already answered, has the time run out?

## Why
- **Prevent cheating:** anything in the browser is visible through the developer tools.
  The earlier prototype kept the solution in the browser – fine for solo, unfair in multiplayer.
- **Security criterion:** "access control and input validation are enforced". Hiding a button is not a
  permission – checks happen where the action happens.
- **One game core for all modes:** solo, presentation mode and duel share the same checking logic.
- **Easy to test:** the rules live in `lib/game/` as plain functions and can be tested without a browser
  (correct answer, wrong answer, double answer, late answer, invalid option).

## Alternatives
- **Everything in the browser (like the prototype):** simpler, no server call per answer, but manipulable.
- **Send the solution encrypted:** more complex, and still decryptable in the browser in the end.

## Limits
- Every answer needs a call to the server → a small delay that depends on the network.
- Timing for the speed bonus uses server time, so network delay counts too.

## How it could change
For fairer timing, the clock could start when the music actually starts playing (the browser reports
"playing") and network delays could be compensated.

## Update 10 Nov 2026: one round at a time
The server sends rounds **one at a time** (`POST /api/games/[id]/next`) instead of all 10 at game start.
Why: the speed bonus needs the moment each round was sent, and the server stores it as `started_at`.
Also, the preview URLs of later rounds stay on the server, so players cannot look ahead.
Alternative: all rounds at the start – one request fewer, but the timer could not be measured fairly.

## Update 10 Nov 2026: answers, timeouts and errors
- The browser answers with a number 0–3 (the button), `"skip"` (preview failed) or `"timeout"` (time ran out).
  A number is the easiest input to validate; the server compares it with the stored correct position.
  `"timeout"` closes the round with 0 points and reveals the song. It gives no advantage: a late click scores 0 anyway.
- "Send round" and "save answer" only change a round that is in the expected state (`waiting` / `open`), so two
  requests at the same moment cannot both count.
- Errors come back as `{ error, message }`: 400 bad input, 404 unknown game, 409 wrong moment (not sent yet,
  still open, already answered, game over), 503 too few songs with a preview, 500 anything unexpected – with a
  generic message only; details go to the server log.
- A game has 5 rounds (spec 001, update). Limit: anyone who knows a game ID can play that game; without
  accounts (decision 007) the random UUID is the only protection – fine for solo.

## Update 10 Nov 2026: clip addresses are sent at the start
`POST /api/games` now also returns the 5 preview URLs in round order, so the browser can load every clip before
its round. Why: the round should start exactly when the music starts – waiting 2–6 seconds for Apple's audio
server while the timer runs felt unfair. Trade-off: someone using the developer tools could listen to later
clips early. For a solo game that risk is small; the rule that matters most stays: **titles, options and the
correct answer are still only sent with "next" and "answer"**. Alternative considered: keep the URLs on the server
and let the browser report "music is playing" (more requests, still dependent on load times).
