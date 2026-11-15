# 013 – Game modes: title, artist, year, mixed

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
