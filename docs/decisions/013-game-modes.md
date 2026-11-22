# 013 – Game modes (title, artist, year, mixed) and filters (genre, decade)

Date: 15 Nov 2026 · Status: decided, built (see the update at the end)

## Decision
A solo game has one of 4 modes: `title` (default), `artist`, `year` or `mixed`. Each round stores its own
question type (`title`, `artist` or `year`) in `rounds.question_type`, and the game stores its mode in
`games.mode`. The server builds all options (`lib/game/rounds.ts`, `lib/game/modes.ts`); answer checking and
scoring are the same in every mode (position 0–3, 100 points plus the speed bonus).

- **Artist:** the correct artist plus 3 artists of other songs, never the same artist twice (ignoring case).
- **Year:** the correct year plus 3 wrong years, each at most 10 years away, all 4 at least 2 years apart,
  none after the current year, none before 1950. The wrong years are calculated, not taken from other songs.
- **Mixed:** the server picks title, artist or year at random for each round.

## Why
- **Exact years as 4 options:** the same buttons and the same scoring as the other modes, so nothing new to check.
  The 2-year gap keeps the options from being near-duplicates; the 10-year limit keeps them believable.
- **Calculated wrong years:** year mode works even when every song in a filter is from the same year.
- **Mixed is random per round:** simple, and a player cannot predict the next question.
- **Question type stored per round:** a replaced round (`/replace`) keeps its type, and in a mixed game the
  type cannot change between building and answering.

## Alternatives
- A year slider or typed year with points for "close" answers: more fun, but a new scoring rule (out of scope).
- Wrong years from other songs: fails when few songs match, and the options would cluster.
- Mixed as a fixed pattern (title, artist, year, ...): predictable.

## Limits
- Artist options use the artist string from the list, so "Bruno Mars" and "Lady Gaga & Bruno Mars" count as
  different artists.
- Only 4 options: a player who knows the decade can often rule out 1–2 years.

## How it could change
Rooms get the same modes in a follow-up spec. A "close year" scoring rule could replace exact years.

## Not built yet (15 Nov 2026)
`/next` does not yet send the round's question type and the reveal does not yet show the year. Both would change
two existing tests in `tests/api/games.test.ts`, which check the exact fields of those replies, so they wait for
the team's OK (see the pull request). Until then, the round screen shows the question for title, artist and year
games and no question in mixed games.

Update 15 Nov 2026: built after the team's OK. `/next` now also sends `questionType` (it says what is asked,
not which option is right), and the reveal's `song` includes `year`. `getGameRounds` returns the song's year,
so three tests changed: the exact field list and reply of `/next` and the reveal in `tests/api/games.test.ts`, and
the stored round in `tests/db/games.test.ts`. The round screen shows the question in every mode, including mixed,
and the reveal shows the year under the artist.

Update 15 Nov 2026: genre and decade filters (spec 003, step 5).
- **Decision:** before a game the player can choose one genre (from `lib/game/genres.ts`) and one decade
  (1960s … 2020s), each "Any" by default. The server keeps only playable songs that match both
  (`filterSongs` in `lib/game/filters.ts`, run on the result of `listSongsWithPreview`). The wrong title and
  artist options come from the same matching songs. The game stores its filters in `games.genre` and
  `games.decade` (empty = Any), and `/replace` reads them back, so a replaced song matches too.
- **Why the filters are stored on the game:** the browser only sends them once, at the start. If `/replace`
  took them from the browser, a player could change them mid-game. Storing them keeps the server in control.
- **Why filter in code, not in SQL:** the decade is calculated from the year (decision 005), and filtering
  after `listSongsWithPreview` means every rule about which songs are playable (preview, catalogue) applies
  automatically. With about 330 songs, filtering in memory costs nothing.
- **Too few songs:** if the matching songs cannot fill a game (fewer than 5, or fewer than 4 different titles
  or artists for the mode), the server answers `422 too-few-songs` with a message such as "Only 3 songs match
  these filters – try 'Any' for genre or decade", stores no game, and the start screen shows the message.
  Without filters the old "music unavailable" error stays. A filter set to "Any" is not sent at all.
- **Alternatives:** several genres or decades at once (out of scope); a `decade` column (could disagree with the
  year); sending the filters again with `/replace` (the browser would decide).
- **Limits:** some combinations are always too small (no 1960s hip-hop). The dropdowns do not show in advance
  how many songs a combination has. When every matching song is already in the game, `/replace` refuses and that
  round is skipped instead of playing a song outside the filters.

Update 15 Nov 2026: avoiding the songs of recent games, and "Change settings".
- **Decision:** the browser keeps its last 3 game IDs in memory (newest first, `lib/client/recent-games.ts`) and sends
  them as `recentGames` with the start request. The server looks up their songs (`getSongIdsOfGames`) and tries the
  lists from `songPools` (`lib/game/recent-songs.ts`) in order: without the songs of all 3 games, then of the newest 2,
  then of the newest one, then the full list. The first list that has at least 5 songs and can fill a game in the
  chosen mode is used. Genre and decade filters apply before this. The results screen has a second button,
  "Change settings", that goes back to the start screen with mode and filters preselected.
- **Why:** with a genre + decade filter only 6–11 songs match, so the same songs came back every game. Step by step
  instead of all-or-nothing: with 11 songs, avoiding two earlier games leaves 1 song, but avoiding the newest still
  leaves 6, so the rule keeps helping after the second game. Memory only (no localStorage): nothing is stored in the
  browser, and a reload simply starts fresh.
- **Security:** the server checks the list (at most 3 IDs, UUID format, else `malformed`). Unknown IDs find no songs,
  and the reply is always just `gameId` and `previewUrls`, so a player learns nothing about other games or the avoided
  songs. Someone sending another player's game ID can only change which songs they themselves get.
- **Alternatives:** localStorage (survives a reload, but stores data in the browser); a server-side history per player
  (needs accounts, decision 007); all-or-nothing (stops working with small filters, see above).
- **Limits:** a reload forgets the last games. With 6 matching songs, 5 of them play in every game no matter what.
  `/replace` does not avoid recent songs. Wrong options may still be titles or artists of recently played songs.
- **Random choice:** without filters, `buildRounds` shuffles all playable songs fairly (Fisher–Yates) and takes 5.
  A test with a fixed random seed checks that every playable song gets played over 120 games and songs without a
  clip never do.

Update 18 Nov 2026: solo settings as tiles, and greyed-out modes (team feedback 18 Nov, points 7 and 8, `feature/solo-settings`).
- **Decision:** the solo start screen uses the tile rows of "Create a room" (now `components/TileGroup.tsx`, shared by
  the room form, the room list and the solo screen) instead of buttons and dropdowns, still single choice. A new
  `GET /api/games/matching-songs?genre=…&decade=…` sends only three numbers for the chosen filters: playable songs,
  different titles, different artists. The screen shows "12 songs match – 5 will be played" and greys out the modes
  that cannot start (title: fewer than 4 titles, artist: fewer than 4 artists, mixed: either). If a filter change
  breaks the chosen mode, it stays chosen but greyed out, "Start game" is disabled and a line says why.
- **Why:** the same look in solo and rooms, and the player sees in advance what would be refused. `modeFits` sits
  next to `buildRounds`, and a test checks that both always agree, so the screen and the server cannot drift apart.
  Keeping the chosen mode (instead of switching it) means nothing changes without the player noticing.
- **Alternatives:** extending `song-counts` (one reply would have two shapes); sending title and artist counts for
  every genre + decade (more data for a rare case); switching to an available mode automatically (easy to miss).
- **Limits:** the server still decides: `POST /api/games` refuses such a game with `too-few-songs` on its own. If the
  numbers cannot be loaded, nothing is greyed out. With today's catalogue no combination with 5+ songs has fewer than
  4 titles or artists, so mode tiles only grey out when the song list changes.

Update 18 Nov 2026: the "12 songs match – 5 will be played" line is removed (`feature/fill-combos`).
- **Decision:** the solo start screen no longer shows how many songs match, and no longer shows "5 songs will be
  played." while the numbers load. `matchLine` now only returns the "Only 3 songs match …" message (or nothing);
  that message still disables "Start game". The notes under greyed-out tiles and the "chosen mode cannot start"
  line stay. The room form keeps its line.
- **Why:** Karin asked for it on 18 Nov 2026 (changed requirement). With at least 10 songs per genre + decade
  (decision 005, update 18 Nov 2026) every filter except 1960s/1970s hip-hop has enough songs anyway. The matching-songs route stays, because
  the greyed-out modes and the "too few" message still need its numbers.
- **Alternatives:** keep the line only for small filters (one more rule to explain); show it only in rooms (that
  is how it is now, by keeping the room form unchanged).
- **Limits:** players no longer see how much variety a filter has before they start.

## Update 22 Nov 2026: songs per set and number of sets in solo (team request)
- **Decision:** the solo start screen has the same "Songs per set" (3 / 5 / 10) and "Number of sets" (1 / 2 / 3) tiles as a room, starting at 1 set of 5. The server checks both and builds that many rounds. After each set but the last, the player sees the set summary and goes on with "Next set"; the last set goes straight to the results.
- **Why:** players wanted to choose the game length as in Multiplayer. Solo has no other players to wait for, so it needs no timer and no standings.
- **Alternatives:** no break between sets (then "sets" would mean nothing visible), or one "Number of songs" row (different from the room settings).
- **Limits:** where a set ends is only shown in the browser; the server stores the rounds, not the sets, which is safe because sets do not change scoring. A game of 30 songs prepares 30 audio players at the Start tap, which has not been tried on a real phone yet.
- **How it could change:** the choices are lists in `lib/game/set-choices.ts`, shared with rooms.
