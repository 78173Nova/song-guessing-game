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
