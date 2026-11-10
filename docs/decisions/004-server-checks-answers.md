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
