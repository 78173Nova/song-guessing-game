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

## Update 10 Nov 2026: no decade column
The `songs` table stores artist, title, original year and genre – **no decade**. The decade is calculated from
the year when a filter needs it (1987 → 1980s), so the two can never disagree. The base starts with 30 songs
(`db/songs.ts`, drafted with Claude, to be checked by a person).

## Update 15 Nov 2026: fixed genre list
Genres come from one fixed list of 6 in `lib/game/genres.ts`: `pop`, `rock`, `hip-hop`, `r&b` (includes soul),
`dance` (includes disco and electronic), `country` (includes folk). Few, broad genres keep each one big enough to
fill a game; the song list test rejects any other genre. The 2 `soul` songs became `r&b` (spec 003).

## Update 15 Nov 2026: the full catalogue (spec 003)
- **Size and range:** 331 songs from 1960–2026 (40–51 per decade) plus *Jailhouse Rock* (1957), which only plays
  under decade "Any". Each of the 6 genres has at least 34 songs. Some genre + decade combinations stay small
  (no 1960s hip-hop, only 2 hip-hop songs in the 2020s).
- **Year rule:** the year the recording was first released, as album or single, whichever came first. Not the year
  it became a hit, not a remaster or compilation. For a cover, the year of the cover.
- **How the list was checked:** Claude drafted each decade, Karin checked every line (well known, year, genre).
  Then `npm run db:seed` looked up every preview; songs without one were renamed (if iTunes has the same
  recording under another name, e.g. "Lady A", "Martha Reeves & The Vandellas") or replaced by a song of the same
  decade and genre. Every song in the list has a preview.
- **No explicit lyrics:** the game may be played in class and on a big screen. Songs whose original recording
  is explicit were replaced. iTunes search only returns the clean edit of such songs, marked
  `trackExplicitness: "cleaned"`, so "cleaned" on the artist's own album = explicit original. Where no clean
  2020s hip-hop hit was found, a clean 2020s song of another genre was used instead.
- **Artist matching:** see decision 006 (update 15 Nov 2026): "feat." partners, "&" = "and" and a leading "The"
  are handled by the matching; real name changes are fixed in `db/songs.ts`.
- **Limits:** the seed never deletes songs, so songs removed from the list stay in the database. They are
  marked as retired and never played (see the update below).

## Update 15 Nov 2026: retired songs (fix/retire-dropped-songs)
- **Decision:** `songs.in_catalogue` (yes/no, default yes) says whether a song is still in `db/songs.ts`. On every
  run the seed sets it to yes for every listed song and no for every other song. The game only plays catalogue
  songs with a preview; the seed only looks up and checks previews of catalogue songs.
- **Why:** removed songs (the 32 explicit ones, *Suga Suga*, *End of Beginning*) still had a preview and were
  still played. Rows are not deleted: old rounds point to them, and the team does not delete data.
- **Alternatives:** delete removed songs (breaks old rounds); clear their preview (the seed would look them up
  again); a separate table of removed songs (two places to keep in sync).
- **Limits:** a song only counts as the same if artist and title match (ignoring case), so a renamed song is a
  new row and the old row is retired. An empty song list is refused, so a mistake cannot retire every song.
- **How it could change:** if songs are later edited in the database instead of `db/songs.ts`, the seed must stop
  overwriting `in_catalogue`.

## Update 15 Nov 2026: decade filter built (spec 003, step 5)
As planned above, the decade is calculated from the year: `decadeOf` in `lib/game/filters.ts` (1987 → 1980).
The filter runs after `listSongsWithPreview`, so a song is only played if it is in the catalogue, has a preview
**and** matches genre and decade (the catalogue and preview rules live in `listSongsWithPreview`). The player can
choose 1960s … 2020s, so *Jailhouse Rock* (1957, decade 1950) only plays under "Any".
