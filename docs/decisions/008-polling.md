# 008 – Multiplayer via polling instead of WebSockets

Date: 10 Nov 2026 · Status: decided, built with the room core (release 2)

## Decision
The shared game state (room, players, current round, answers, scores) lives in the database.
Every screen (big screen and phones) asks the server for the current state **every 1–2 seconds**.
The server alone moves the game forward (next round, end of round) based on server time.

For the online duel, the server sets a **start time** for each round; every phone starts the clip at that time.

## Why
- Vercel runs server code in short-lived functions and does **not support long-lived WebSocket connections**.
- Polling works on any host, needs no extra service and no extra key.
- For a quiz a delay of 1–2 seconds is acceptable.
- Easy to explain and to test: every poll is an ordinary request with an ordinary answer.

## Alternatives
- **Hosted real-time services (Ably, Pusher):** instant updates, but one more service, key and failure point.
- **Supabase Realtime:** would mean switching database provider.
- **Own WebSocket server (e.g. Socket.IO):** needs a host that keeps running; not possible on Vercel.

## Limits
- Delay of up to the poll interval (1–2 s).
- Many players × frequent polls = many requests to Vercel and Neon. With ~30 players in class this is fine;
  with thousands it would not be.
- Phones on a weak connection see changes later.

## Rules for simultaneous actions (to be tested)
- An answer counts only if it arrives before the round's end time (server time).
- Each player can answer each round once; a second answer is rejected.
- Equal scores share the rank.

## How it could change
The polling code would be replaced by a real-time service in one place; the game rules on the server stay the same.

## Update 15 Nov 2026: built with the room API
The state every page polls is `GET /api/rooms/[code]` (`getRoomState` in `lib/api/rooms.ts`). The same request
also moves the game forward: it closes a round that is due and finishes the room after the last round, so no
timer is needed. The three rules for simultaneous actions above are tested in `tests/api/rooms.test.ts` and
`tests/game/rooms.test.ts`. Details and limits: decision 012, update 15 Nov 2026.

## Update 16 Nov 2026: shared start time, server-paced rooms (issue #33)
The start time above is now built for every room game, not only the duel. Nobody taps "Next" any more: Start
schedules round 1 five seconds ahead, and each later round 8 seconds after the previous one closed. The state
(`GET /api/rooms/[code]`) carries `serverNow` and `nextRound.startsAt`; each device works out how far its own
clock is off from `serverNow` and starts the clip it loaded in advance at that time. Pages now poll every second.
The server still decides everything from timestamps whenever a device polls. Details: decision 015.

## Update 22 Nov 2026: a load test for 25 players
- **Decision:** `npm run load-test -- --room <code> --bots <1–24>` (`scripts/load-test.ts`) joins bots to a room
  created on the real site. Each bot polls once a second like a phone, answers each round at a random moment
  1–12 s after the start, and leaves when the game is over. The script prints count, failures, median, 95% and
  slowest time per kind of request.
- **Why:** the team has about 10 devices, a class has 25 players. Real phones plus bots fill a room, so we can see
  on our own phones whether polling still feels smooth with a full room.
- **Alternatives:** many browser tabs as players (no code, but background tabs get slowed down by the browser);
  a load-testing tool such as k6 (one more tool to install and explain).
- **Limits:** all bots run from one computer and one network, so it tests Vercel and Neon, not the classroom
  Wi-Fi or 25 phones downloading clips. Bots do not load the clips. Only the option reading and the report
  are tested automatically; the network part is checked by running it against a real room.
- **How it could change:** more bots per room would need a bigger player limit; the script would stay the same.
