-- Database schema. Owner: Niklas – change tables only after agreeing with him (CLAUDE.md rule 9).
-- Every statement must be safe to run again ("IF NOT EXISTS"), because `npm run db:seed` runs it each time.
-- lib/db/schema.ts splits this file at semicolons, so do not put semicolons inside comments or strings.

-- The curated song list (decision 005) plus the cached iTunes data (decision 006).
CREATE TABLE IF NOT EXISTS songs (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title             text    NOT NULL CHECK (btrim(title) <> ''),
  artist            text    NOT NULL CHECK (btrim(artist) <> ''),
  year              integer NOT NULL CHECK (year BETWEEN 1900 AND 2100), -- original release year
  genre             text    NOT NULL CHECK (btrim(genre) <> ''),
  preview_url       text,        -- 30-second preview on Apple's servers (only the URL, never the audio)
  artwork_url       text,        -- album cover
  store_url         text,        -- link to the song on Apple Music
  preview_cached_at timestamptz  -- when the three URLs above were looked up, empty = not looked up yet
);

-- The same song may only exist once, ignoring upper/lower case ("Queen" = "queen").
CREATE UNIQUE INDEX IF NOT EXISTS songs_artist_title_unique ON songs (lower(artist), lower(title));

-- One row per game. The random UUID is the only thing the browser needs to know about a game.
CREATE TABLE IF NOT EXISTS games (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The rounds of a game, all created when the game starts (decision 004).
-- status: waiting = not sent yet, open = sent but not answered, answered, skipped = preview failed.
CREATE TABLE IF NOT EXISTS rounds (
  game_id        uuid        NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  round_number   integer     NOT NULL CHECK (round_number >= 1),  -- how many rounds is decided in lib/game
  song_id        integer     NOT NULL REFERENCES songs (id),      -- the correct song
  options        text[]      NOT NULL CHECK (cardinality(options) = 4),  -- titles in the order shown
  correct_option smallint    NOT NULL CHECK (correct_option BETWEEN 0 AND 3),  -- never sent before answering
  status         text        NOT NULL DEFAULT 'waiting'
                             CHECK (status IN ('waiting', 'open', 'answered', 'skipped')),
  started_at     timestamptz,  -- when the server sent the round, the speed bonus counts from here
  answered_at    timestamptz,
  chosen_option  smallint    CHECK (chosen_option BETWEEN 0 AND 3),  -- empty for skip and timeout
  points         integer     CHECK (points >= 0),                    -- empty until answered
  PRIMARY KEY (game_id, round_number),
  UNIQUE (game_id, song_id),                                         -- no song twice in a game
  CHECK (status = 'waiting' OR started_at IS NOT NULL)               -- sent before answered
);
