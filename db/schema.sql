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

-- ---------------------------------------------------------------------------------------------
-- Rooms: several players in one shared game (spec 002, decision 012). Agreed with Niklas on 11 Nov 2026.
-- ---------------------------------------------------------------------------------------------

-- One row per room. The code is what players type to join. It is never reused, so rooms are not deleted
-- to free a code. A room expires 3 hours after created_at (worked out in the code, no extra column).
-- status: lobby = players can join, playing = the game runs (game_id is set), finished = final scores stay.
-- Tokens are never stored, only their SHA-256 hash (64 hex characters), like passwords.
CREATE TABLE IF NOT EXISTS rooms (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL UNIQUE CHECK (code ~ '^[1-9][0-9]{5}$'),  -- 6 digits, no leading 0
  host_token_hash text        NOT NULL CHECK (host_token_hash ~ '^[0-9a-f]{64}$'),
  status          text        NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  game_id         uuid        REFERENCES games (id),  -- empty until the host taps Start
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'lobby' OR game_id IS NOT NULL)     -- a started room always has its game
);

-- The players of a room. The limit of 50 per room is enforced in lib/db/rooms.ts (addPlayer), not here.
CREATE TABLE IF NOT EXISTS room_players (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  nickname   text        NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 20),
  token_hash text        NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  joined_at  timestamptz NOT NULL DEFAULT now()
);

-- A nickname may only exist once per room, ignoring upper/lower case ("Anna" = "anna").
CREATE UNIQUE INDEX IF NOT EXISTS room_players_nickname_unique ON room_players (room_id, lower(nickname));

-- One row per player per round of a room game. No row = the player did not answer (0 points).
-- Room games use the normal games / rounds tables for songs, options and the correct answer, and the
-- normal round statuses (open while it runs, answered once it has closed). But rounds.chosen_option and
-- rounds.points stay empty for room games: there is one answer per player, and those live here instead.
CREATE TABLE IF NOT EXISTS room_answers (
  game_id       uuid        NOT NULL,
  round_number  integer     NOT NULL,
  player_id     uuid        NOT NULL REFERENCES room_players (id) ON DELETE CASCADE,
  chosen_option smallint    NOT NULL CHECK (chosen_option BETWEEN 0 AND 3),
  points        integer     NOT NULL CHECK (points >= 0),
  answered_at   timestamptz NOT NULL,
  PRIMARY KEY (game_id, round_number, player_id),  -- one answer per player per round, even at the same moment
  FOREIGN KEY (game_id, round_number) REFERENCES rounds (game_id, round_number) ON DELETE CASCADE
);
