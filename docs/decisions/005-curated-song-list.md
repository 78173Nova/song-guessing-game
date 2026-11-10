# 005 – Curated song list instead of open search

Date: 10 Nov 2026 · Status: decided

## Decision
Which songs appear in the game is set by **our own list in the database** with artist, title, original
release year, genre and decade. The iTunes API is only used to look up the preview URL (and cover) for a
song from the list. Found preview URLs are cached.

Start: about 30 songs in the base, then 300+ songs (person 2).

## Why
- **Well-known songs only:** the iTunes API has no popularity data. The prototype searched by artist and
  therefore also picked unknown tracks, live versions or remixes.
- **Correct years:** Apple's date is often that of a remaster. Our list holds the original year – so we
  don't need MusicBrainz (one fewer API that can fail).
- **Clean filters:** genre and decade are defined in the list, not guessed.
- **Testable and predictable:** tests can use a small fixed list.
- **Fewer API calls:** preview URLs are looked up once and reused.

## Alternatives
- **Seed artists + iTunes search (prototype):** large variety, but also unknown songs and wrong years.
- **Chart feeds (e.g. Apple top charts):** automatically current, but mostly new hits rather than classics; not checked yet.
- **Spotify API:** has popularity scores, but needs a key and login; preview clips are restricted there.

## Limits
- The list has to be **maintained**. Claude can draft it, but a human reviews it.
- For some songs iTunes finds no preview or only another version → these songs are skipped or flagged.
- "Well-known" is subjective and depends on the country (US store vs. Portugal/Germany).
- **Terms of use:** previews may be streamed but not downloaded or stored. We store only the **URL**,
  never the audio file. Show the attribution ("Previews provided courtesy of iTunes") and a link to the song.

## How it could change
The list can grow at any time (extend the seed script). Later options: players suggest songs, or a
"current charts" category from a feed.
