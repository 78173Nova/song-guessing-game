# Spec 002 – Room core: create a room, join with a nickname, play together

Owners: Steinar (Person 3) and Jasper (Person 4) · Branches: several small ones (see "Suggested order") · Status: agreed
(schema with Niklas on 11 Nov 2026; Jasper left the spec to Steinar on 12 Nov 2026)

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
      (e.g. `482913`, never starting with 0, **never reused** – unique forever) and a random **host token**
- [ ] A player opens the join page, types the room code and a **nickname**, and taps "Join". The server returns a
      random **player token**. Host and player tokens are long random values, never shown on screen
- [ ] The server stores tokens only **hashed (SHA-256)**, like passwords: it hashes the token from the request and
      compares. A leaked database copy cannot be used to act as a host or player
- [ ] The browser keeps its token (localStorage), so **reloading the page keeps your place** in the room – as host
      or as player
- [ ] Tokens are sent in a request header, **never in the URL** (URLs end up in browser history and server logs)
- [ ] Nickname rules: 1–20 characters after trimming spaces, no control characters; unique within the room,
      ignoring upper/lower case ("Anna" = "anna"). The UI shows nicknames as plain text (React escapes them)
- [ ] Joining works **only in the lobby** (before the host taps Start). At most **50 players** per room
- [ ] A room expires **3 hours** after it was created (worked out from `created_at`, no extra column): every request
      for it gets "This room has closed"
- [ ] **One game per room:** after the last round the final scores stay; another game needs a new room

### The game in a room
- [ ] The host sees the room code, the list of joined nicknames (updates by itself) and a "Start" button.
      Start needs at least 1 player
- [ ] Start picks 5 songs and builds the rounds with the **existing game core** (`lib/game/rounds.ts`), stored as a
      normal game in `games` / `rounds`, the same way as a solo game. The **host page plays the clips** and loads them
      in advance like the solo game (`lib/client/clip-loader.ts`: retry, then replace the song before its round starts)
- [ ] **The host taps "Next"** to open each round (round 1 included, after the clip is loaded). The server stores
      when the round opened; from then on players have **15 seconds**
- [ ] Phones show the round number and the 4 answer buttons while a round is open; the host page shows the
      4 options, the countdown and how many players have answered ("7 / 12 answered")
- [ ] A round **closes** when every player has answered or 15 seconds have passed (server time) – whichever
      comes first. There is no background timer: the server checks this whenever any page asks for the state
- [ ] After a round closes, everyone sees the correct song (title, artist, artwork); each phone sees "right/wrong"
      and its own points; the host page shows the scoreboard. Then the host taps "Next" again
- [ ] After round 5 the room is finished: the host page shows the final ranking, each phone its own rank and score.
      **Equal scores share a rank** (decision 012)
- [ ] **Scoring is the same as solo:** 100 for correct + up to 50 for speed, from `lib/game/scoring.ts`, measured
      from when the round opened. No answer = 0 points

### Server rules (the server decides – decision 004)
- [ ] Every page **polls** the room state every 1–2 seconds (decision 008). The state shows only what that
      viewer may see: while a round is open, **nobody receives the correct answer** – not the host, not the phones
- [ ] An answer counts only if: the player token belongs to this room, the round is the open one, it arrives before
      the 15 seconds are over (server time), the option is 0–3, and the player has not answered this round yet
- [ ] Only the host token can start the game and open the next round. "Next" is rejected while a round is still open
- [ ] **Room games are closed to the solo routes:** `/api/games/[id]/next`, `/answer` and `/replace` reject any game
      that belongs to a room with 404 "This game does not exist" (checked by looking for a room that points to the
      game – no extra column). Otherwise anyone who learned the game ID could open rounds, answer or swap songs
      for everyone. The game ID only ever goes to the host page, never to the phones
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

### Database (agreed with Niklas, 11 Nov 2026)
| Table | Columns | Rules in the database |
|---|---|---|
| `rooms` | id (uuid), code, host_token_hash, status, game_id (empty until Start), created_at | code = 6 digits, not starting with 0, unique forever; status `lobby` / `playing` / `finished` |
| `room_players` | id, room_id, nickname, token_hash, joined_at | nickname 1–20 characters; unique per room ignoring case; deleting a room deletes its players |
| `room_answers` | game_id + round_number, player_id, chosen_option, points, answered_at | one answer per player per round (primary key – also stops simultaneous double answers); option 0–3 |

- The songs, options and correct answer per round stay in the existing `games` / `rounds` tables (one game core).
- **Round status for room games:** a round is `open` while it runs and is set to `answered` when it closes (all
  answered or 15 s passed) – the existing statuses, no change to `rounds`. For room games `rounds.chosen_option` and
  `rounds.points` stay empty; each player's answer lives in `room_answers`. A comment in `db/schema.sql` explains this
- **50-player limit:** "count, then insert" can let a few extra players in when many join at once. The approach
  (e.g. a lock or a single SQL statement) is decided in `feature/room-schema` and covered by the test below

### Tests
- [ ] `lib/game/rooms.ts`: nickname accepted/rejected (empty, only spaces, 20 vs 21 characters, control characters,
      emoji), room code format, round closed after 15 s / when all answered / not yet, ranking with ties
- [ ] `lib/db/rooms.ts` with PGlite: code unique, nickname unique ignoring case, one answer per player per round,
      deleting a room deletes its players, tokens stored only as hashes
- [ ] `lib/api/rooms.ts` with PGlite, for **accepted and rejected** actions: create room; join (OK, wrong code,
      started, full, nickname taken in different case, expired); start (OK, wrong token, no players, twice);
      next (OK, round still open, after the last round, wrong token); answer (OK with points, wrong option, too
      late, twice, wrong round, token from another room); state never contains the correct answer while a round
      is open; two "Next" at once open one round; same nickname twice at once → one rejected; 51 players joining
      at once → exactly 50 get in
- [ ] **Solo routes on a room game → 404** for next, answer and replace (`lib/api/games.ts`)
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
- The browser's network tab on host and phones never shows the correct answer while a round is open; the phones
  never see the game ID.
- Reloading a phone or the host page mid-game keeps its place.
- `npm test` passes locally and in the GitHub Action on `main`; `npm audit` reports 0 vulnerabilities.
- A new decision `docs/decisions/012-rooms.md` records the room rules (host-paced rounds, lobby-only joining,
  hashed tokens, expiry, shared ranks, solo routes closed to room games) with Why / Alternatives / Limits /
  How it could change; decision 008 is updated if polling details change.

## Suggested order (one branch and pull request each)
1. `feature/room-schema` – tables + schema comment, `lib/db/rooms.ts` + PGlite tests. Schema change: post in the
   group chat before merging (no further OK from Niklas needed if it matches the table above)
2. `feature/room-api` – `lib/game/rooms.ts`, `lib/api/rooms.ts`, routes, solo routes closed to room games + tests
3. `feature/room-host` – host page, polling, clips
4. `feature/room-player` – join page and phone screens

Split: Steinar takes 1–2 (server), Jasper takes 3–4 (pages). Jasper can start the pages against the agreed route
list while the server is being built. Both review each other's pull requests. Changes to the split are agreed in the
group chat.

## Decided on 11 Nov 2026 (with Niklas, schema owner)
- Tables and rules as in "Database" above; tokens stored as SHA-256 hashes; codes never reused; expiry from `created_at`
- Room rounds use the existing `open` → `answered` statuses; player answers live in `room_answers`
- Solo routes reject room games with 404
- Spec numbers: room core is 002, Karin's catalogue spec is 003

## Decided on 12 Nov 2026
- Jasper left the spec to Steinar; the split above (Steinar server, Jasper pages) stands
