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
