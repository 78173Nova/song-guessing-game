# 006 – Behaviour when the iTunes API is unavailable

Date: 10 Nov 2026 · Status: decided

## Decision
All iTunes calls go through `lib/music/`, on the server, with
- a **timeout** (e.g. 5 seconds),
- a **cache**: preview URLs once found are stored in the database and reused,
- **fixed failure behaviour**:

| Situation | What the app does |
|---|---|
| Preview URL for a song already cached | Uses it – iTunes is not called at all |
| iTunes does not respond / errors, but enough cached songs | Game starts with cached songs only |
| iTunes does not respond and too few songs available | Clear message: "The music source is not reachable right now. Please try again in a moment." – no crash |
| A single preview fails to load in the browser | Round is skipped and not scored, the player sees a note |
| Too many requests (rate limit) | Same as "not reachable", plus spacing between requests |

## Why
- The course explicitly asks: "What happens if the external API is unavailable?"
  Crashing is not an option; the fallback is part of the demo.
- iTunes allows only about 20 requests per minute. Without a cache, presentation mode would hit the limit quickly.
- One module for all calls = one place to test and change.

## Alternatives
- **Download the audio and serve it ourselves:** independent of iTunes, but not allowed by the terms of use.
- **Just show an error, no cache:** simpler, but the game would stop completely at every disruption.

## Limits
- Cached preview URLs can expire at some point → then the song is looked up again or skipped.
- If Apple's audio servers themselves are down, the app cannot play music – only show a clear message.

## Tests
Tests never call the real API. They use fake responses for: success, timeout, error code,
empty results, song without a preview.

## Update 10 Nov 2026: previews looked up in advance, skipped rounds recorded
- **In advance:** `npm run db:seed` looks up every song's preview on iTunes, spaced out to stay under the
  ~20 requests per minute, and stores it. Starting a game uses only songs with a cached preview, so it
  normally makes no iTunes call. Why: a first game with 30 unknown songs would hit the limit.
  Limit: a newly added song can only be played after the seed has run again.
- **Skipped rounds:** when a preview fails to load in the browser, it tells the server ("skip"). The round is
  stored as `skipped` and gives 0 points. Alternative: count it as wrong – simpler, but unfair to the player.

## Update 10 Nov 2026: how `lib/music/` is built
- **Two results, never an exception:** `lookupPreview` returns either the preview or `unavailable`
  (timeout, error code incl. 429, network error, broken reply) or `not-found` (no matching version).
- **Picking the track:** the first result whose artist and title match after clean-up (case, accents,
  punctuation, "(feat. …)", "- Remastered …") and that is not a karaoke, live or remix version.
  Our artist followed by a partner ("Daft Punk & Pharrell Williams") counts. Why: iTunes also returns covers
  and other versions. Alternative: take the first result – simpler, but often the wrong recording.
- **Seed spacing:** 3.5 seconds between lookups (about 17 per minute). If a song fails, the seed moves on.
- Limit: expired preview URLs are not refreshed yet – a cached URL is used as it is.

## Update 10 Nov 2026: clips that will not load in the browser
- The browser tries a clip twice; if it still fails, it asks `POST /api/games/[id]/replace` for another song for
  that round (only before the round starts, up to 3 times). Round 1 gives up after 30 seconds with a clear
  message; for later rounds this happens unnoticed during the earlier rounds.
- `npm run db:seed` checks every stored clip address with Apple's audio server (first 2 bytes only). Only a clear
  "not found" (403/404/410) clears the address so it is looked up again; if our own connection fails, it is kept.
  Why not clear it when a player's browser fails? One player on bad Wi-Fi would empty the song list for everyone.
