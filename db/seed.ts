// `npm run db:seed`: creates the tables and loads the song list into the database from DATABASE_URL.
// Safe to run again: existing songs are not duplicated and their cached previews are kept.
// Coming in feature/music-api: looking up each song's preview on iTunes in advance (decision 006).
import { getDb } from "../lib/db/client.ts";
import { applySchema } from "../lib/db/schema.ts";
import { listSongs, upsertSongs } from "../lib/db/songs.ts";
import { songList } from "./songs.ts";

async function main() {
  const db = getDb();
  await applySchema(db);
  await upsertSongs(db, songList);
  const songs = await listSongs(db);
  const withPreview = songs.filter((s) => s.previewUrl !== null).length;
  console.log(`Seed done: ${songs.length} songs in the database, ${withPreview} with a cached preview.`);
}

main().catch((error: unknown) => {
  // Only the message – never print the connection string.
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
