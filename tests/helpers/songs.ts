import type { Db } from "@/lib/db/client";
import { listSongs, savePreview, upsertSongs } from "@/lib/db/songs";

// Adds `count` test songs, the first `withPreview` of them with a cached preview.
export async function addTestSongs(db: Db, count: number, withPreview = count) {
  const input = Array.from({ length: count }, (_, i) => ({
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    year: 2000,
    genre: "pop",
  }));
  await upsertSongs(db, input);
  const songs = await listSongs(db);
  for (const song of songs.slice(0, withPreview)) {
    await savePreview(
      db,
      song.id,
      {
        previewUrl: `https://audio.example.com/${song.id}.m4a`,
        artworkUrl: `https://art.example.com/${song.id}.jpg`,
        storeUrl: `https://music.example.com/${song.id}`,
      },
      new Date("2026-11-10T10:00:00Z"),
    );
  }
  return listSongs(db);
}
