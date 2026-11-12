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
- If the lock turns out to be a bottleneck, the player counter above is the next step (needs Niklas's OK).
