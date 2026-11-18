# Spec 003 – Song catalogue, filters and game modes (solo)

Owner: Karin (Person 2) · Branch: several small branches (see "Suggested order") · Target: 20 Nov 2026

## Why
The base game only asks "which song is this?" from 30 songs, so after two or three games players hear the same
songs again. A catalogue of 300+ well-known songs, filters by genre and decade, and three more ways to guess
(artist, year, mixed) make the game worth replaying and are a large part of the "scope" criterion.
Every addition keeps the base rule: **the server decides** which songs are played, which options are shown and
whether an answer is right. The browser only sends choices, and the server checks them against fixed lists.
This spec covers the **solo game**. Rooms get modes and filters in a small follow-up spec (plan step 4) once
the room core is merged.
When a line below can be read two ways, choose the simpler option that keeps the server in control.

## What
### Song catalogue
- [ ] `db/songs.ts` holds **300+ well-known songs** (artist, title, original release year, genre), released
      **1960–2026**, roughly even across the 7 decades 1960s–2020s (about 40–50 songs each).
      One exception: *Jailhouse Rock* (Elvis Presley, 1957) stays from the base list and only appears when the
      decade is "Any" (there is no 1950s filter)
- [ ] **Year rule:** the year is when that recording was first released, as album or single, whichever came first
      (e.g. "Hello" by Lionel Richie: album *Can't Slow Down* 1983, single 1984 → 1983). Not the year it became a hit,
      not a remaster, live version or compilation. For a cover, the year of the cover recording, not of the original song.
      For a re-recording (e.g. "Take On Me", 1985), the year of the version that is played
- [ ] Genres come from one fixed list of 6, defined in one place in code:
      `pop`, `rock`, `hip-hop`, `r&b` (includes soul), `dance` (includes disco and electronic), `country` (includes folk).
      The 2 current `soul` songs become `r&b`
- [ ] The screen shows readable names: Pop, Rock, Hip-hop, R&B / Soul, Dance / Electronic, Country / Folk
- [ ] Each genre has at least 30 songs and each decade at least 35. Not every genre exists in every decade
      (no 1960s hip-hop), so some genre + decade combinations are allowed to be too small
      (updated 18 Nov 2026: every genre + decade combination has at least 10 songs, except hip-hop in the 1960s
      and 1970s – see "Decided on 18 Nov 2026 (`feature/fill-combos`)" below)
- [ ] Added on one branch, `feature/songs`, with **one commit per decade** (about 45 songs each). Claude drafts each
      decade, Karin checks every line (song well known, original year, genre) before it is committed
- [ ] After each batch, `npm run db:seed` looks up the new previews. Songs that iTunes finds no preview for are
      replaced in the list by another song, so the final catalogue has 300+ songs **with** a preview

### Game modes
- [ ] Four modes: `title` (today's game, the default), `artist`, `year`, `mixed`
- [ ] **Artist:** the 4 options are artist names: the correct artist plus 3 different artists from other songs
      (never the same artist twice, ignoring upper/lower case: two Queen songs do not give "Queen" twice)
- [ ] **Year:** the 4 options are years: the correct original year plus 3 wrong years, each within 10 years of
      the correct one, all at least 2 years apart from each other, none after the current year and none before 1950.
      Wrong years are calculated, not taken from other songs, so year mode always works
- [ ] **Mixed:** for each round the server picks title, artist or year at random
- [ ] Each round stores its question type, so a replaced round (`/replace`) keeps the same type, and the round
      screen can say "Which song?", "Who sings this?" or "Which year?"
- [ ] Answer checking and scoring do not change: the answer is still the position of the chosen option (0–3),
      100 points for correct plus the same speed bonus, for every mode
- [ ] The reveal after answering also shows the song's year (title, artist, year, artwork, store link)

### Filters
- [ ] Before a game the player can choose **one genre** and **one decade** (1960s … 2020s), each with "Any" as the default
- [ ] Only songs with a cached preview that match both filters are played. The wrong title and artist options
      come from the same matching songs
- [ ] The decade is calculated from the year (1987 → 1980s), no decade column (decision 005)
- [ ] The game stores its filters, so `/replace` only picks a replacement song that matches them
- [ ] If fewer than 5 songs match (or fewer than 4 different titles or artists for the chosen mode), the game does
      not start and the screen says so clearly, e.g. "Only 3 songs match these filters – try 'Any' for genre or decade"
- [ ] **Avoid recent songs** (added 15 Nov 2026): the browser keeps the IDs of the player's last 3 games in memory
      (not in localStorage, a reload forgets them) and sends them with the start request as `recentGames`, newest first.
      The server leaves out the songs of those games step by step: first of all 3 games, then of the newest 2, then of
      the newest one, then none. It uses the first step that leaves at least 5 matching songs **and** can fill a game in
      the chosen mode. Genre and decade filters apply first. Nothing about the avoided songs is sent back

### Server and validation
- [ ] `POST /api/games` accepts optional `mode`, `genre` and `decade`. Missing values mean title / any / any,
      so the current start screen and room games keep working unchanged
- [ ] Rejected with a clear error: unknown mode, unknown genre, decade not one of 1960, 1970 … 2020, wrong types
      (e.g. a decade sent as text or a list), extra-long strings, unknown extra fields
- [ ] `recentGames` is optional: a list of at most 3 game IDs in UUID format, anything else is rejected. Unknown IDs
      are ignored, and the reply is the same as without them
- [ ] `/next` still never contains the correct answer: no correct position, no year, no artist in title mode, and so on
- [ ] Schema change (anyone may change it, decision 009; tell the team in the group chat): added with
      `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, because `CREATE TABLE IF NOT EXISTS` would skip existing tables:
  - `games.mode` – text, required, default `title`, one of `title` / `artist` / `year` / `mixed`
  - `games.genre` – text, empty = any
  - `games.decade` – integer, empty = any, a multiple of 10
  - `rounds.question_type` – text, required, default `title`, one of `title` / `artist` / `year`
  - The comment on `rounds.options` changes from "titles" to "titles, artists or years"

### Game (UI)
- [ ] Start screen: mode choice (4 buttons, "Title" selected), a genre dropdown and a decade dropdown (both "Any"),
      then "Start game". Usable on a phone
- [ ] Round screen shows the question for that round's type ("Which song?" / "Who sings this?" / "Which year?")
- [ ] Reveal screen shows the year; the "not enough songs" message appears on the start screen
- [ ] Results screen: "Play again" (same mode and filters) and "Change settings" (back to the start screen with the
      last mode, genre and decade preselected)
- [ ] `components/SoloGame.tsx` is Niklas's area too (error screens, phone layout): agree in the group chat who
      changes which part first, to avoid merge conflicts

### Tests and checks
- [ ] Song list test (no database): no duplicates (artist + title, ignoring case), every genre from the fixed list,
      every year in 1960–2026 except *Jailhouse Rock* (1957), which is the only song allowed outside that range,
      every title and artist non-empty. With the last decade: at least 300 songs, at least 30
      per genre and 35 per decade
- [ ] `lib/game/` tests: artist options (4 different artists, correct one included, same artist never twice);
      year options (all rules above, including near the current year and near 1950); mixed mode with a fixed
      random function (each type can appear, the type is stored per round); "not enough songs" for each mode
- [ ] `lib/api/` tests with PGlite: a game starts in each mode; filters are respected, also by `/replace`;
      recent games are avoided step by step, unknown IDs ignored, wrong lists rejected; without filters every
      playable song gets played over many games (with a fixed random seed, so the test cannot fail by chance);
      a replaced round keeps its question type; too few matching songs gives a clear error; every rejected input
      above is rejected; `/next` never contains the answer; the reveal contains the year
- [ ] No test calls the real iTunes API or the real Neon database

### Docs
- [ ] Update decision 005 ("Update <date>: …"): genre list, decade range, how the list was checked
- [ ] New decision 013 – game modes and filters: why 4 exact years and how the wrong years are chosen, why mixed is
      random, why the filters are stored on the game, limits

## Out of scope
- Modes and filters inside rooms and presentation mode (follow-up spec, plan step 4)
- Typed answers, a year slider, partial points for "close" years
- Choosing several genres or decades at once
- High scores per mode or filter (Niklas's high scores stay as they are)
- Deleting songs from the database, an admin page, player song suggestions
- Popularity data or any music source other than iTunes
- Changing the number of rounds or options

## Done when
- On the **Vercel URL**, one player can play a full game in each of the 4 modes, on a laptop and on a phone.
- With "rock" and "1980s", every song in the game is a rock song from 1980–1989, also after a clip was replaced.
- A filter with too few songs shows a clear message; nothing crashes.
- The browser's network tab never shows the correct title, artist or year before answering.
- The production database has 300+ songs with a cached preview, and Karin has checked every song in the list.
- `npm test` passes locally and in the GitHub Action on `main`.
- Decisions 005 and 013 match what was built.

## Suggested order (one branch and pull request each)
1. `docs/spec-catalogue-modes` – this spec
2. `feature/genre-list` – the fixed genre list, `soul` → `r&b`, the song list test (without the size rules yet)
3. `feature/songs` – all 300+ songs, one commit per decade (1960s … 2020s), `npm run db:seed` after each commit.
   The last commit adds the size rules to the song list test. Can run alongside steps 4–5
4. `feature/game-modes` – schema for mode and question type, artist, year and mixed modes, mode choice on the start screen
5. `feature/filters` – schema for genre and decade, filters on start and `/replace`, the dropdowns and the "not enough songs" message

## Decided on 15 Nov 2026
- *Jailhouse Rock* (1957) stays as the one song outside 1960–2026: the seed never deletes songs, so removing it from
  the list would leave it in the database anyway. It only appears under decade "Any", and the song list test allows it
- All decades go on one branch (`feature/songs`) with one commit per decade, instead of one pull request per decade
- Year rule (see "Song catalogue"): first release of the recording, album or single, whichever came first. Album and
  single years often differ, so one rule keeps the year mode fair and makes every year checkable

## Decided on 15 Nov 2026 (after testing `feature/filters`)
- "Play again" keeps mode and filters, so a second button "Change settings" goes back to the start screen
- Small filters (6–11 songs) repeated the same songs, so the server avoids the songs of the player's last 3 games.
  Step by step instead of all-or-nothing: with 11 songs, avoiding 2 earlier games leaves only 1 song, so all-or-nothing
  would stop working from the third game, while avoiding just the newest game still leaves 6
- `/replace` does not avoid recent songs (it only runs when a clip fails to load)

## Decided on 18 Nov 2026 (filter gaps, `feature/filter-gaps`)
- **2020s hip-hop:** the decade had only 1 hip-hop song (*luther*), so that filter could never start a game. 6 songs
  were added (*Mood*, *Laugh Now Cry Later*, *ROCKSTAR*, *INDUSTRY BABY*, *First Class*, *Paint the Town Red*),
  following the year rule above. The song list test now requires at least 5 hip-hop songs from the 2020s
- **Explicit rule for the 2020s:** a 2020s song is allowed when the clip the game plays is not explicit
  (iTunes `trackExplicitness` "notExplicit" or "cleaned"), even if the original recording is explicit.
  Earlier decades keep the old rule (no explicit originals). `lookupPreview` never picks an explicit clip, for any
  song (decision 005, update 18 Nov 2026). Songs whose clean edit still has heavy themes are left out by hand
- **Greyed-out filters:** `GET /api/games/song-counts` sends the number of playable songs per genre and decade
  (only counts, nothing about single songs). On the start screen, choosing a genre greys out the decades with fewer
  than 5 of its songs, and choosing a decade greys out the genres with fewer than 5 songs from it, with a short
  note under the dropdowns. If the counts cannot be loaded, nothing is greyed out
- **The server still decides:** `POST /api/games` refuses a combination with too few songs exactly as before
  (`too-few-songs`), whatever the screen allows. The screen only checks the song count, not the "4 different
  titles or artists" rule for a mode, so that message can still appear

## Decided on 18 Nov 2026 (solo settings, `feature/solo-settings`, team feedback 18 Nov, points 7 and 8)
- **Tiles instead of dropdowns (team feedback 18 Nov, point 8):** the start screen shows mode, genre and decade as the tile rows of "Create a
  room". The tile row moved into its own component, `components/TileGroup.tsx`, used by the room form, the room list
  and the solo screen; the room screens look and behave as before. Solo stays single choice: one genre, one decade,
  "Any" by default, so `POST /api/games` and the database do not change. Above "Start game" a line says, e.g.,
  "12 songs match – 5 will be played", or the "Only 3 songs match …" message (then Start is disabled).
  This replaces "a genre dropdown and a decade dropdown" under "Game (UI)".
  (Changed 18 Nov 2026, `feature/fill-combos`: the "12 songs match – 5 will be played" line and the loading text
  "5 songs will be played." are gone; only the "Only 3 songs match …" message is left.)
- **Greyed-out tiles (team feedback 18 Nov, point 7):** genre and decade tiles with fewer than 5 playable songs are greyed out as before, now as
  disabled tiles with the note under the decade row. Mode tiles are greyed out when the chosen filters match fewer
  than 4 different titles (title mode), fewer than 4 different artists (artist mode) or either (mixed mode, which asks
  for both), with a short note under the mode row. With fewer than 5 songs no mode is greyed out: the filters are the
  problem, and the line above "Start game" says so
- **New route:** `GET /api/games/matching-songs?genre=…&decade=…` sends only `{ songs, titles, artists }` for the
  chosen filters (missing = Any), counted like the answer options (ignoring upper/lower case). An unknown genre or
  decade, a filter given twice or any other field is refused with 400. If it cannot be loaded, nothing is greyed out
- **Chosen mode stops working after a filter change:** it stays chosen but greyed out, "Start game" is disabled, and a
  line says why, e.g. "Artist needs 4 different artists – these filters have only 2. Choose another mode or other
  filters." The mode is never switched without the player noticing
- **The server still decides:** `POST /api/games` refuses such a game with `too-few-songs` on its own. The screen's rule
  (`modeFits`) sits next to `buildRounds`, and a test checks that both agree for every mode
- With today's catalogue no combination with 5 or more songs has fewer than 4 titles or artists, so the mode tiles only
  grey out if the song list changes. The tests cover it with made-up songs

## Decided on 18 Nov 2026 (`feature/fill-combos`)
- **At least 10 songs per genre + decade:** every combination of the 6 genres and the 7 decades has at least 10
  songs, so each filter can start a game with some variety. Only hip-hop in the 1960s and 1970s is left out (those
  songs do not exist). A test in `tests/db/song-list.test.ts` checks it. 75 songs were added (413 in total), one
  commit per decade, with the same rules as above (year rule, well known, no explicit original before the 2020s,
  clean clip in the 2020s, every song checked with `lookupPreview`, no artist more than 3 times)
- **Titles that are easy to tell apart:** a new song's title must not equal or start like a title in the list, and
  must not share its first word (ignoring "The" and "A") with a title in the same genre + decade (e.g. "Let's",
  "Love", "Don't"). Titles that end alike in the same genre + decade (*Wagon Wheel*, *Jesus, Take the Wheel*) are
  avoided too. Songs left out on purpose are listed in decision 005, so they are not suggested again
- **Purple Haze:** the artist is "The Jimi Hendrix Experience", as iTunes lists it
- **Solo start screen:** the "12 songs match – 5 will be played" line is removed, and so is the loading text
  "5 songs will be played.". The "Only 3 songs match …" message (Start disabled) and the notes under greyed-out
  tiles stay. The room form keeps its line

## Open questions
- **Production database:** `npm run db:seed` uses the `dev` database from `.env.local`. Karin asks Niklas for access
  to the production database or asks him to seed it after `feature/songs` is merged.
