// The preview cache: previews found on iTunes are stored in the songs table and reused (decision 006).
import type { Db } from "../db/client";
import { listSongsWithoutPreview, savePreview, type Song } from "../db/songs.ts";
import { lookupPreview, type PreviewLookup, type SongToLookUp } from "./itunes.ts";

// iTunes allows about 20 requests per minute. 3.5 seconds apart = at most ~17 per minute.
export const SECONDS_BETWEEN_LOOKUPS = 3.5;

type Deps = {
  lookup?: (song: SongToLookUp) => Promise<PreviewLookup>; // tests pass a fake
  now?: () => Date;
};

// Returns the song's preview: from the cache if present (no iTunes call), otherwise looked up and saved.
export async function getPreview(db: Db, song: Song, deps: Deps = {}): Promise<PreviewLookup> {
  if (song.previewUrl !== null) {
    return {
      ok: true,
      previewUrl: song.previewUrl,
      artworkUrl: song.artworkUrl ?? "",
      storeUrl: song.storeUrl ?? "",
    };
  }

  const lookup = deps.lookup ?? lookupPreview;
  const now = deps.now ?? (() => new Date());

  const result = await lookup({ artist: song.artist, title: song.title });
  if (result.ok) {
    const { previewUrl, artworkUrl, storeUrl } = result;
    await savePreview(db, song.id, { previewUrl, artworkUrl, storeUrl }, now());
  }
  return result;
}

export type FillSummary = {
  found: number;
  failed: { artist: string; title: string; reason: "unavailable" | "not-found" }[];
};

// Used by `npm run db:seed`: looks up every song that has no preview yet, spaced out to respect the
// rate limit. A failed song is reported and skipped; it stays without a preview.
export async function fillMissingPreviews(
  db: Db,
  deps: Deps & { wait?: (ms: number) => Promise<void> } = {},
): Promise<FillSummary> {
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const songs = await listSongsWithoutPreview(db);
  const summary: FillSummary = { found: 0, failed: [] };

  for (const [index, song] of songs.entries()) {
    if (index > 0) await wait(SECONDS_BETWEEN_LOOKUPS * 1000);
    const result = await getPreview(db, song, deps);
    if (result.ok) {
      summary.found += 1;
    } else {
      summary.failed.push({ artist: song.artist, title: song.title, reason: result.reason });
    }
  }
  return summary;
}
