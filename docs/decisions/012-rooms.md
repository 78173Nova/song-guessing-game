# 012 – Rooms: tables, tokens, codes and the player limit

Date: 12 Nov 2026 · Status: decided (schema agreed with Niklas on 11 Nov 2026)

This file covers the database side of the room core (spec 002, branch `feature/room-schema`).
The game rules on top of it (host-paced rounds, lobby-only joining, shared ranks, solo routes closed to
room games) are added here as updates when `feature/room-api` builds them.

## Decision
- **Three new tables:** `rooms`, `room_players` and `room_answers`. A room game is a normal game in
  `games` / `rounds` (one game core). Only the answers differ: `rounds.chosen_option` and `rounds.points` stay
  empty, and each player's answer is a row in `room_answers`.
- **Hashed tokens:** the host token and the player tokens are stored only as SHA-256 hashes. `lib/db/rooms.ts`
  takes the raw token and hashes it itself (`hashToken`), and the database refuses any value that is not
  64 hex characters.
- **Codes are never reused:** `rooms.code` is unique forever, so rooms are never deleted to free a code.
  `createRoom` returns `null` when a code is taken and the caller tries another one.
- **Expiry from `created_at`:** a room closes 3 hours after it was created. This is worked out from
  `created_at` whenever a request arrives. There is no extra column and no clean-up job.
- **The 50-player limit:** joining runs three queries as one transaction (`addPlayer`): lock the room's row,
  insert the player only if the room is in the lobby and has fewer than 50 players, then read why nothing
  was inserted. `Db` got a second type, `TransactionDb`, with a `transaction` method for this.
- **Rules that the database itself enforces:** code format, status values, nickname length, nickname unique
  per room ignoring case, one answer per player per round (primary key), option 0–3.

## Why
- **Hashes:** a leaked copy of the database cannot be used to act as a host or player, the same reason
  passwords are hashed. A plain SHA-256 without salt is enough because the tokens are long random values,
  not words a person chose. Hashing inside `lib/db/` means no caller can forget it.
- **Codes never reused:** an old code can never lead into a different, newer room.
- **Expiry from `created_at`:** one fact stored once. Nothing has to run in the background, which Vercel
  does not offer anyway.
- **Lock for the limit:** "count, then insert" lets extra players in when several join at the same moment,
  because all of them count before any of them has inserted. With the lock, joins for one room happen one
  after another. The lock must be its own query: a single query only sees the data as it was when it began,
  so "lock and count" in one query would still count the old number. The same lock also makes a join wait
  for a Start that happens at the same moment, so nobody slips in after the game began.
- **Database rules:** they hold even if the code above has a mistake, and the primary key on `room_answers`
  is what stops two simultaneous answers from the same player.

## Alternatives
- **Player counter on `rooms`** (`player_count` with a rule "at most 50", raised in the same statement as the
  insert): the simplest SQL, but one more column than agreed and a second copy of "how many players".
- **Join, then step back out if there are more than 50:** no lock, but the lobby could briefly show 51 and
  several people could be rejected although a seat was free.
- **Hashing in `lib/api/`:** the database layer would have to trust every caller to remember.
- **Storing tokens as they are:** simpler, but anyone who can read the table could take over any room.
- **An `expires_at` column:** would allow different lifetimes per room, which we do not need.

## Limits
- PGlite runs one query at a time, so the tests prove that joins cannot overtake each other between
  queries (60 at once → exactly 50), but not that two real connections wait at the lock. That part relies on
  standard Postgres behaviour and on checking the Vercel preview by hand.
- Joining costs three queries instead of one. Fine for 50 players per room.
- "Ignoring case" uses Postgres `lower()`. It is tested for "Ægir" / "ægir" on PGlite. Neon could treat
  rare letters differently if its language settings differ.
- Rooms and their rows are never deleted, so the tables only grow. Small for a course project.
- Nothing limits how many rooms one person can create (spec 002, out of scope).
- If two Starts arrive at the same moment, the loser's game stays behind unused (same as a failed solo start).

## How it could change
- If players should be able to leave or be removed, the limit keeps working, because it counts the rows.
- If old rooms should be cleaned up, codes would need a separate "used codes" list to stay unique forever.
- If the lock turns out to be a bottleneck, the player counter above is the next step.

## Update 15 Nov 2026: the game rules and the routes (`feature/room-api`)

The rules live in `lib/game/rooms.ts`, the steps of each route in `lib/api/rooms.ts`. The route list with
all replies and errors is in `specs/002-room-core.md` ("Routes").

### Decision
- **Host-paced rounds:** only the host token can start the game and open a round ("Next"). A round closes
  when every player has answered or 15 seconds have passed. There is no timer in the background: every
  "state" and "next" request first brings the game up to date (close the round if it is due, finish the room
  after the last round).
- **The time limit:** an answer at exactly 15.000 seconds still counts, the same as in `scoring.ts`. Anything
  later is rejected as "too late" and nothing is stored. Points are worked out when the answer arrives.
- **Nothing leaks while a round is open:** the answer route only confirms the choice. The correct option, the
  song and all points appear in the state only once the round has closed, and scores count closed rounds only.
- **Lobby-only joining:** players can join until the host taps Start. A room game is one game: after round 5
  the room is finished and the scores stay.
- **Shared ranks:** equal scores share a rank and the next rank is skipped (1, 1, 3). A rank is 1 + the number
  of players with more points. Players with equal scores are listed in the order they joined.
- **Solo routes closed to room games:** `/api/games/[id]/next`, `/answer` and `/replace` answer 404 for a game
  that belongs to a room. The host page swaps a song through `/api/rooms/[code]/replace` instead, which
  needs the host token.
- **Tokens and codes:** a token is 32 random bytes from Node's `crypto.randomBytes`, sent as 64 hex
  characters in the header `Authorization: Bearer <token>`. A code is drawn with `crypto.randomInt`; if it is
  taken, the server draws again, up to 10 times.
- **The game ID never leaves the server.** Every room action goes through the room code and a token, so
  neither the host page nor the phones need it.
- **One order of checks in every route:** room exists (404), room not expired (409), token (403),
  input (400), right moment (409).

### Why
- **Host-paced:** the host plays the music, so only the host knows when the room is ready for the next song.
- **No background timer:** Vercel has none (decision 008). With pages polling every 1–2 seconds, a due round
  is closed at most one poll late.
- **Nothing leaks:** a score that jumps during a round would tell a player that their answer was right, and
  they could call it out to the room.
- **Lobby-only joining:** a player who joins in round 3 could never catch up, and the "everyone has answered"
  rule needs a fixed number of players.
- **1, 1, 3:** this is how sports tables and most quiz apps rank, so nobody has to have it explained.
- **Solo routes closed:** they only ask for a game ID and no token. Anyone who learned the ID could otherwise
  open rounds, answer or swap songs for the whole room.
- **`Authorization` header:** it is the standard place for a token. URLs end up in browser history and logs.
- **404 for a badly shaped code:** the same reply as for an unknown code, like the solo routes do with game IDs.

### Alternatives
- **Rounds that open by themselves** after a pause: no tapping for the host, but the music and the phones
  would have to be kept in step, which is the hard part of the online duel.
- **Telling the player right/wrong immediately:** more exciting on the phone, but it gives the answer away
  to everyone sitting next to them.
- **Dense ranks (1, 1, 2):** equally simple, but less familiar.
- **Giving the host page the game ID** and letting it use the solo replace route (the spec's first idea):
  one route fewer, but that route would have to stay open to room games.
- **Two header names** (`X-Host-Token`, `X-Player-Token`): saves one small query per player poll, but is not
  the standard header.
- **410 "Gone" for an expired room:** a little more exact than 409, but one more status code to explain.

### Limits
- Time is measured when the answer **arrives** at the server. A tap at 14.9 seconds on a slow connection can
  be too late.
- A round's closing time in the database is the moment of the request that noticed it, not exactly 15 seconds
  after it opened. Points are not affected, because they are worked out per answer.
- If nobody polls, a due round stays "open" in the database until the next request. Nothing can be gained
  from this: late answers are rejected by the clock, not by the status.
- A state request costs about 6 small queries. With 50 players polling every 1–2 seconds that is fine for a
  class, not for thousands (decision 008).
- Codes are only 6 digits and nothing limits requests, so someone could try codes until one fits and join a
  stranger's lobby. They could only play along, and the host sees every nickname before starting.
- Nicknames may contain invisible characters (not control characters), so two names can look alike.
- If two Starts arrive at the same moment, the loser's game stays behind unused (see above).

### How it could change
- A grace period for slow connections would be one number in `isTimeUp`.
- Showing the whole scoreboard on the phones means adding `scoreboard` to the player's state.
- "Play again" in the same room would need a way to point a room at a second game.

## Update 16 Nov 2026: the room creator plays, 25 players, new closing rules (issue #32)

### Decision
- **The room creator plays.** Only an account holder can create a room (`POST /api/rooms` needs the session
  cookie and a `{ nickname }`, otherwise 401). The creator is the room's first player: room and player are
  inserted by one statement (`createRoom`), so a room never exists without its creator. There is no separate
  host any more (`GLOSSARY.md`: "Room creator").
- **One token for the creator.** The creator gets one player token like everyone else. Its hash is stored in
  `room_players.token_hash` and also in `rooms.host_token_hash`, which now means "the room creator's key" (the
  column keeps its name, so no database change). Start, Next and Replace still check that column; answering
  and the room state check the player row, so the creator can answer like any player. The state says
  `role: "creator" | "player"` and always contains `me`; only the creator also gets `previewUrls` and the
  `scoreboard`, until the next ticket moves the clips to every device.
- **At most 25 players**, the creator included (was 50). **Start needs at least 2 players** (was 1).
- **Closing rules:** a room closes 30 minutes after it was created if its game has not started, and 3 hours
  after it was created in any case (`isRoomClosed`, was `isRoomExpired`). Both are worked out from
  `created_at` and the room's status on every request – still no background job. A closed room's link or
  code shows "This room has closed": the state route answers 404/409 before it looks at the token, so the
  room page can say so before anyone types a nickname. In the same way, someone without a seat in a started
  room gets 409 "This game has already started" instead of 403, so the page does not offer a nickname form.
- **Fixed settings for now:** Multiplayer, title mode, any genre and decade, one set of 5 rounds. Room
  settings come in a later ticket.
- **The token in the browser** lives in `sessionStorage`, one per room code: it survives a reload of the tab,
  and a second tab can join as a second player.
- **After logging in** the login page goes to `?next=` (e.g. back to "Create a room"), but only to a plain path
  on this site (`safeNextPath`), so our login page cannot be used to send people to another site. The login
  page also remembers `next` in `localStorage` and uses it once on the next login, so a guest who signs up
  first (the verification email often opens a new tab) still comes back to "Create a room".

### Why
- **The creator plays:** the reworked rooms are played by everyone on their own device; nobody only runs the
  game. One token per person keeps it simple, and reusing `host_token_hash` avoids a schema change while the
  role can still be handed to another player later (ticket "Play again") by copying that player's hash.
- **25 players:** a class-sized room; the "Multiplayer room" in `GLOSSARY.md` says two to twenty-five.
- **2 to start:** a room game with one player is a solo game.
- **30 minutes in the lobby:** an abandoned lobby should not stay joinable for 3 hours.
- **`sessionStorage`:** easy to test with two tabs, and nothing stays behind after the tab is closed.

### Alternatives
- **A `creator_player_id` column** on `rooms`: clearer, but a schema change and a circular reference between
  `rooms` and `room_players`.
- **Renaming `host_token_hash`:** the better name, but every existing database would need a migration.
- **`localStorage`:** survives closing the tab, but then every tab of one browser is the same player.
- **Checking the login on the server before showing the create page:** with `cacheComponents` this needs a
  Suspense boundary; the page asks `/api/accounts/me` instead, and the server checks again when creating.

### Limits
- If the browser blocks `sessionStorage`, the creator loses their seat on reload and cannot start the room.
- Closing a tab does not leave the room: the nickname stays in the lobby. Leaving comes with "Away, kick and
  leave" (#40).
- One account can create any number of rooms (spec 002, still out of scope).

## Update 16 Nov 2026: server-paced rounds, clips and standings for everyone (issue #33)
The "host-paced rounds" and the creator-only `previewUrls` / `scoreboard` above are replaced. Nobody taps "Next"
any more: Start schedules round 1, and every state request closes due rounds and schedules the next one from
the stored times. `POST /api/rooms/[code]/next` is removed. Every player now gets `previewUrls`, `serverNow`,
`nextRound` and the `standings` (the glossary term, instead of "scoreboard"). The creator's token is still needed
for Start and Replace. Why, alternatives and limits: decision 015.

## Update 17 Nov 2026: away, kick and leave (issue #40)

### Decision
- **Away:** every state request stores the time on the player's row (`room_players.last_seen_at`, also set at the
  join). A player whose device has not asked for **5 s** is away: the state lists them in `away` and every device
  shows a loading symbol on their nickname. They simply get no answer (0 points) for rounds they miss. The next
  request from their device (also after a reload, the token is in `sessionStorage`) clears it.
- **Kick:** once a player has been away for **more than 60 s** (more than 65 s without a request), the room
  creator can kick them with `POST /api/rooms/[code]/kick { nickname }`, in the lobby or during the game, after
  "Are you sure you want to kick <nickname>?". The state lists them in `kickable`, for the creator only. The row
  stays, marked `removed = 'kicked'`: the token is refused ("The room creator removed you from this room"), the
  nickname stays taken, and a join that sends the kicked token along is refused. Their points leave the standings.
- **Leave:** `POST /api/rooms/[code]/leave`, for anyone at any time. In the lobby the row is deleted, so the seat
  and nickname are free again; if it is the room creator, the room closes for everyone instead
  (`rooms.closed_reason = 'creator-left'`, "The room creator closed the room"). Once the game has started, the row
  is marked `removed = 'left'`: gone for good, out of the standings, and the rounds no longer wait for them. The
  game goes on without the creator, and then nobody can kick.
- **Everyone left:** when the last player leaves a started room, it closes (`closed_reason = 'everyone-left'`).
- A Duel room (two players) needs no extra rule: the lobby waits for a new second player, and in the game the one
  who stays plays on alone.

### Why
- Polling already happens every second (decision 008), so "away" costs one small UPDATE per request and no
  background job.
- Keeping kicked and left rows (instead of deleting them) is what lets the server say *why* a token stopped
  working and keeps a kicked nickname out; deleting the row in the lobby is what frees the seat.
- 60 s before a kick gives a player with a short network problem or a locked phone time to come back.

### Alternatives
- **Heartbeat route** separate from the state: one more request per second for the same information.
- **Kick any time:** the creator could remove players who are simply slow; the away rule keeps it fair.
- **Ending the game when the creator leaves:** everyone else would lose their game; the server paces rounds
  anyway, so nothing needs the creator.

### Limits
- Players have no accounts, so a kicked player in a new tab or another browser can join a lobby again under a
  new nickname. The rule stops the easy way back (same tab, same nickname).
- A player whose device stops asking still counts for "everyone has answered", so a round with an away player
  runs its full 15 seconds.
