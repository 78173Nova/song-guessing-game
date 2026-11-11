# Spec 002 – Room core: create a room, join with a nickname, play together

Owners: Steinar (Person 3) and Jasper (Person 4) · Branches: several small ones (see "Suggested order") · Status: draft

## Why
Presentation mode (must have 5) and the online duel (optional 6) both need the same foundation: several people in
one shared game, each answering on their own phone, with one server deciding what happens. The room core builds
that foundation once, so presentation mode only has to add the QR code, the big-screen design and the leaderboard
polish on top. It is also the biggest step for the "scope" criterion: it turns a solo project into a multiplayer one.

The room core should be **playable but plain**: a host page and a phone page that work end to end with two
browsers, so the rules can be checked by hand on the Vercel URL – not a finished design.
When a line below can be read two ways, choose the simpler option that keeps the server in control.

## What

### Rooms and players
- [ ] The host opens the host page and taps "Create room". The server creates a room with a **6-digit code**
      (e.g. `482913`, never starting with 0, unique among rooms that have not expired) and a random **host token**
- [ ] A player opens the join page, types the room code and a **nickname**, and taps "Join". The server returns a
      random **player token**. Host and player tokens are long random values, never shown on screen
- [ ] The browser keeps its token (localStorage), so **reloading the page keeps your place** in the room – as host
      or as player
- [ ] Tokens are sent in a request header, **never in the URL** (URLs end up in browser history and server logs)
- [ ] Nickname rules: 1–20 characters after trimming spaces, no control characters; unique within the room,
      ignoring upper/lower case ("Anna" = "anna"). The UI shows nicknames as plain text (React escapes them)
- [ ] Joining works **only in the lobby** (before the host taps Start). At most **50 players** per room
- [ ] A room expires **3 hours** after it was created: every request for it gets "This room has closed"
- [ ] **One game per room:** after the last round the final scores stay; another game needs a new room

### The game in a room
- [ ] The host sees the room code, the list of joined nicknames (updates by itself) and a "Start" button.
      Start needs at least 1 player
- [ ] Start picks 5 songs and builds the rounds with the **existing game core** (`lib/game/rounds.ts`), the same
      way as a solo game. The **host page plays the clips** and loads them in advance like the solo game
      (`lib/client/clip-loader.ts`: retry, then replace the song before its round starts)
- [ ] **The host taps "Next"** to open each round (round 1 included, after the clip is loaded). The server stores
      when the round opened; from then on players have **15 seconds**
- [ ] Phones show the round number and the 4 answer buttons while a round is open; the host page shows the
      4 options, the countdown and how many players have answered ("7 / 12 answered")
- [ ] A round **closes** when every player has answered or 15 seconds have passed (server time) – whichever
      comes first. There is no background timer: the server checks this whenever any page asks for the state
- [ ] After a round closes, everyone sees the correct song (title, artist, artwork); each phone sees "right/wrong"
      and its own points; the host page shows the scoreboard. Then the host taps "Next" again
- [ ] After round 5 the room is finished: the host page shows the final ranking, each phone its own rank and score.
      **Equal scores share a rank** (decision 008)
- [ ] **Scoring is the same as solo:** 100 for correct + up to 50 for speed, from `lib/game/scoring.ts`, measured
      from when the round opened. No answer = 0 points

### Server rules (the server decides – decision 004)
- [ ] Every page **polls** the room state every 1–2 seconds (decision 008). The state shows only what that
      viewer may see: while a round is open, **nobody receives the correct answer** – not the host, not the phones
- [ ] An answer counts only if: the player token belongs to this room, the round is the open one, it arrives before
      the 15 seconds are over (server time), the option is 0–3, and the player has not answered this round yet
- [ ] Only the host token can start the game and open the next round. "Next" is rejected while a round is still open
- [ ] **Simultaneous actions:** two "Next" taps at the same moment open only one round; two answers from the same
      player at the same moment count once; two players joining with the same nickname at the same moment – one
      gets in, the other gets "nickname taken"; the 51st player is rejected even when several join at once
- [ ] Every input is validated on the server (room code format, nickname length/characters, option, round number,
      token format, body size). Errors come back as `{ error, message }` with the same status codes as the solo
      routes (400 bad input, 403 wrong token, 404 unknown room, 409 wrong moment, 500 unexpected)
- [ ] Clear messages for: unknown room code, room already started, room full, nickname taken, invalid nickname,
      room closed, answer too late, network error ("Can't reach the server…")

### Where the code goes (same pattern as the solo game)
- `lib/game/rooms.ts` – rules without database: nickname check, code format, "is the round closed?", ranking
- `lib/db/rooms.ts` – all SQL for rooms, players and answers
- `lib/api/rooms.ts` – what each route does step by step; `app/api/rooms/...` only calls it
- `lib/client/` – room API calls, polling, host/player screen state (tested with Vitest)
- `components/RoomHost.tsx`, `components/RoomPlayer.tsx` and two pages (e.g. `/host` and `/join`)

### Database (needs Niklas's OK before building – CLAUDE.md rule 9)
Proposal to discuss with Niklas; the exact columns are his call:
- `rooms`: code, host token, status (lobby / playing / finished), link to the game, created at
- `room_players`: room, nickname, player token, joined at – unique nickname per room (ignoring case)
- `room_answers`: room, round, player, chosen option, points, answered at – one answer per player per round
- The songs, options and correct answer per round stay in the existing `games` / `rounds` tables (one game core)

### Tests
- [ ] `lib/game/rooms.ts`: nickname accepted/rejected (empty, only spaces, 20 vs 21 characters, control characters,
      emoji), room code format, round closed after 15 s / when all answered / not yet, ranking with ties
- [ ] `lib/api/rooms.ts` with PGlite, for **accepted and rejected** actions: create room; join (OK, wrong code,
      started, full, nickname taken in different case, expired); start (OK, wrong token, no players, twice);
      next (OK, round still open, after the last round, wrong token); answer (OK with points, wrong option, too
      late, twice, wrong round, token from another room); state never contains the correct answer while a round
      is open; two "Next" at once open one round; same nickname twice at once → one rejected
- [ ] `lib/client/`: screen state for host and player (lobby → round → reveal → final), late replies ignored,
      polling stops when the room is finished
- [ ] No test calls the real iTunes API or the real Neon database

## Out of scope
- QR code, big-screen design, leaderboard animations (presentation mode)
- Music on the phones, synchronised start (online duel)
- Joining after the start, "play again" in the same room, removing players, a leave button
- Other game modes and filters inside rooms (step 4, "Connect")
- High scores for room games, accounts, login
- Limiting how many rooms one person can create (noted as a limit in the decision doc)

## Done when
- On the **Vercel preview URL**, a host on a laptop creates a room, two phones join with nicknames, the host plays
  5 rounds, both phones answer, and everyone sees the correct answers and the final ranking.
- Wrong code, taken nickname, full or started room, and a late answer each show a clear message – no crash.
- The browser's network tab on host and phones never shows the correct answer while a round is open.
- Reloading a phone or the host page mid-game keeps its place.
- `npm test` passes locally and in the GitHub Action on `main`; `npm audit` reports 0 vulnerabilities.
- A new decision `docs/decisions/012-rooms.md` records the room rules (host-paced rounds, lobby-only joining,
  tokens, expiry) with Why / Alternatives / Limits / How it could change; decision 008 is updated if polling
  details change.

## Suggested order (one branch and pull request each)
1. `feature/room-schema` – tables (after Niklas's OK), `lib/db/rooms.ts` + PGlite tests
2. `feature/room-api` – `lib/game/rooms.ts`, `lib/api/rooms.ts`, routes + tests
3. `feature/room-host` – host page, polling, clips
4. `feature/room-player` – join page and phone screens

Proposed split, to agree with Jasper: Steinar takes 1–2 (server), Jasper takes 3–4 (pages). Jasper can start the
pages against the agreed route list while the server is being built. Both review each other's pull requests.

## Open questions
- Exact tables and columns – Niklas (schema owner)
- Who builds which part – Steinar and Jasper
