// `npm run db:seed`: creates the tables, loads the song list and looks up missing previews on iTunes.
// Safe to run again: existing songs are not duplicated; stored previews are checked and only broken or
// missing ones are looked up on iTunes. Songs no longer in db/songs.ts are retired (never played), not deleted.
import { getDb } from "../lib/db/client.ts";
import { applySchema } from "../lib/db/schema.ts";
import { listSongs, listSongsWithoutPreview, setCatalogue, upsertSongs } from "../lib/db/songs.ts";
import { fillMissingPreviews, SECONDS_BETWEEN_LOOKUPS, verifyCachedPreviews } from "../lib/music/preview.ts";
import { songList } from "./songs.ts";

async function main() {
  const db = getDb();
  await applySchema(db);
  await upsertSongs(db, songList);
  await setCatalogue(db, songList);

  // Stored clip addresses can expire: check them, so broken ones are looked up again below.
  const verified = await verifyCachedPreviews(db);
  if (verified.checked > 0) {
    console.log(`Checked ${verified.checked} stored previews, ${verified.broken.length} no longer work.`);
  }
  for (const song of verified.broken) console.log(`  Expired preview: ${song.artist} – ${song.title}`);

  const missing = (await listSongsWithoutPreview(db)).length;
  if (missing > 0) {
    const seconds = Math.ceil((missing - 1) * SECONDS_BETWEEN_LOOKUPS);
    console.log(`Looking up ${missing} previews on iTunes (about ${seconds} seconds, spaced out for the rate limit) ...`);
  }
  const summary = await fillMissingPreviews(db);
  for (const song of summary.failed) {
    console.log(`  No preview: ${song.artist} – ${song.title} (${song.reason})`);
  }

  const songs = await listSongs(db);
  const catalogue = songs.filter((s) => s.inCatalogue);
  const withPreview = catalogue.filter((s) => s.previewUrl !== null).length;
  console.log(
    `Seed done: ${catalogue.length} songs in the catalogue, ${withPreview} with a cached preview` +
      ` (${songs.length - catalogue.length} retired songs kept in the database, never played).`,
  );
}

main().catch((error: unknown) => {
  // Only the message – never print the connection string.
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
