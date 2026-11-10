// `npm run db:seed`: creates the tables, loads the song list and looks up missing previews on iTunes.
// Safe to run again: existing songs are not duplicated, and songs that already have a preview are skipped.
import { getDb } from "../lib/db/client.ts";
import { applySchema } from "../lib/db/schema.ts";
import { listSongs, upsertSongs } from "../lib/db/songs.ts";
import { fillMissingPreviews, SECONDS_BETWEEN_LOOKUPS } from "../lib/music/preview.ts";
import { songList } from "./songs.ts";

async function main() {
  const db = getDb();
  await applySchema(db);
  await upsertSongs(db, songList);

  const missing = (await listSongs(db)).filter((s) => s.previewUrl === null).length;
  if (missing > 0) {
    const seconds = Math.ceil((missing - 1) * SECONDS_BETWEEN_LOOKUPS);
    console.log(`Looking up ${missing} previews on iTunes (about ${seconds} seconds, spaced out for the rate limit) ...`);
  }
  const summary = await fillMissingPreviews(db);
  for (const song of summary.failed) {
    console.log(`  No preview: ${song.artist} – ${song.title} (${song.reason})`);
  }

  const songs = await listSongs(db);
  const withPreview = songs.filter((s) => s.previewUrl !== null).length;
  console.log(`Seed done: ${songs.length} songs in the database, ${withPreview} with a cached preview.`);
}

main().catch((error: unknown) => {
  // Only the message – never print the connection string.
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
