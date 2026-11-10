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

// The cached iTunes data for one song (see lib/music/).
export type PreviewData = {
  previewUrl: string;
  artworkUrl: string;
  storeUrl: string;
};

const SONG_COLUMNS =
  "id, title, artist, year, genre, preview_url, artwork_url, store_url, preview_cached_at";

// All songs, in the order they were added.
export async function listSongs(db: Db): Promise<Song[]> {
  const rows = await db.query<SongRow>(`SELECT ${SONG_COLUMNS} FROM songs ORDER BY id`);
  return rows.map(toSong);
}

// Songs whose preview has not been looked up yet, in the order they were added.
export async function listSongsWithoutPreview(db: Db): Promise<Song[]> {
  const rows = await db.query<SongRow>(
    `SELECT ${SONG_COLUMNS} FROM songs WHERE preview_url IS NULL ORDER BY id`,
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
  };
}
