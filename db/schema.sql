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
