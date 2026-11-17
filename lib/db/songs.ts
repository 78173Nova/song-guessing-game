import type { Db } from "./client";

// A song as it appears in our curated list (db/songs.ts).
export type SongInput = {
  title: string;
  artist: string;
  year: number; // original release year
  genre: string;
};

// A song as stored in the database, including the cached iTunes data (null = not looked up yet).
export type Song = SongInput & {
  id: number;
  previewUrl: string | null;
  artworkUrl: string | null;
  storeUrl: string | null;
  previewCachedAt: Date | null;
  inCatalogue: boolean; // false = removed from db/songs.ts, never played (see setCatalogue)
};

type SongRow = {
  id: number;
  title: string;
  artist: string;
  year: number;
  genre: string;
  preview_url: string | null;
  artwork_url: string | null;
  store_url: string | null;
  preview_cached_at: Date | string | null;
  in_catalogue: boolean;
};

// Adds new songs. A song that already exists (same artist + title, ignoring case) only gets its
// year and genre updated – the cached preview data is never touched, so re-running the seed is safe.
// One query per song: simple, and a list with the same song twice cannot cause an error.
export async function upsertSongs(db: Db, songs: SongInput[]): Promise<void> {
  for (const song of songs) {
    await db.query(
      `INSERT INTO songs (title, artist, year, genre)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ((lower(artist)), (lower(title)))
       DO UPDATE SET year = EXCLUDED.year, genre = EXCLUDED.genre`,
      [song.title, song.artist, song.year, song.genre],
    );
  }
}

// Marks which songs are in the catalogue: true for every song in `songs` (same artist + title, ignoring
// case), false for every other song. Nothing is deleted – old rounds still point to retired songs.
// One query, so the game never sees a half-updated catalogue. An empty list is refused: it would retire
// every song, which is almost certainly a mistake.
export async function setCatalogue(db: Db, songs: SongInput[]): Promise<void> {
  if (songs.length === 0) {
    throw new Error("setCatalogue: the song list is empty, refusing to retire every song");
  }
  await db.query(
    `UPDATE songs SET in_catalogue = EXISTS (
       SELECT 1 FROM unnest($1::text[], $2::text[]) AS listed (artist, title)
       WHERE lower(listed.artist) = lower(songs.artist) AND lower(listed.title) = lower(songs.title)
     )`,
    [songs.map((s) => s.artist), songs.map((s) => s.title)],
  );
}

// The cached iTunes data for one song (see lib/music/).
export type PreviewData = {
  previewUrl: string;
  artworkUrl: string;
  storeUrl: string;
};

const SONG_COLUMNS =
  "id, title, artist, year, genre, preview_url, artwork_url, store_url, preview_cached_at, in_catalogue";

// All songs, retired ones included, in the order they were added.
export async function listSongs(db: Db): Promise<Song[]> {
  const rows = await db.query<SongRow>(`SELECT ${SONG_COLUMNS} FROM songs ORDER BY id`);
  return rows.map(toSong);
}

// Catalogue songs whose preview has not been looked up yet, in the order they were added.
// Retired songs are skipped: there is no point looking them up on iTunes.
export async function listSongsWithoutPreview(db: Db): Promise<Song[]> {
  const rows = await db.query<SongRow>(
    `SELECT ${SONG_COLUMNS} FROM songs WHERE preview_url IS NULL AND in_catalogue ORDER BY id`,
  );
  return rows.map(toSong);
}

// Songs that can be played: catalogue songs with a cached preview (decisions 005 and 006).
export async function listSongsWithPreview(db: Db): Promise<Song[]> {
  const rows = await db.query<SongRow>(
    `SELECT ${SONG_COLUMNS} FROM songs WHERE preview_url IS NOT NULL AND in_catalogue ORDER BY id`,
  );
  return rows.map(toSong);
}

// Stores the iTunes data found for a song, and when it was found.
export async function savePreview(db: Db, songId: number, preview: PreviewData, now: Date): Promise<void> {
  await db.query(
    `UPDATE songs SET preview_url = $1, artwork_url = $2, store_url = $3, preview_cached_at = $4
     WHERE id = $5`,
    [preview.previewUrl, preview.artworkUrl, preview.storeUrl, now.toISOString(), songId],
  );
}

// Forgets a song's cached iTunes data (its clip address no longer works), so the seed looks it up again.
export async function clearPreview(db: Db, songId: number): Promise<void> {
  await db.query(
    `UPDATE songs SET preview_url = NULL, artwork_url = NULL, store_url = NULL, preview_cached_at = NULL
     WHERE id = $1`,
    [songId],
  );
}

function toSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    year: row.year,
    genre: row.genre,
    previewUrl: row.preview_url,
    artworkUrl: row.artwork_url,
    storeUrl: row.store_url,
    previewCachedAt: row.preview_cached_at === null ? null : new Date(row.preview_cached_at),
    inCatalogue: row.in_catalogue,
  };
}
