import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { listSongs, listSongsWithoutPreview, upsertSongs, type SongInput } from "@/lib/db/songs";
import { createTestDb } from "../helpers/test-db";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

const threeSongs: SongInput[] = [
  { title: "Bohemian Rhapsody", artist: "Queen", year: 1975, genre: "rock" },
  { title: "Billie Jean", artist: "Michael Jackson", year: 1983, genre: "pop" },
  { title: "Hey Ya!", artist: "OutKast", year: 2003, genre: "hip-hop" },
];

describe("upsertSongs / listSongs", () => {
  it("saves songs and lists them with empty preview fields", async () => {
    await upsertSongs(db, threeSongs);
    const songs = await listSongs(db);

    expect(songs).toHaveLength(3);
    for (const input of threeSongs) {
      const song = songs.find((s) => s.title === input.title);
      expect(song).toMatchObject({
        ...input,
        previewUrl: null,
        artworkUrl: null,
        storeUrl: null,
        previewCachedAt: null,
      });
      expect(typeof song?.id).toBe("number");
    }
  });

  it("does not create duplicates when run twice", async () => {
    await upsertSongs(db, threeSongs);
    await upsertSongs(db, threeSongs);
    expect(await listSongs(db)).toHaveLength(3);
  });

  it("updates a corrected year but keeps the cached preview", async () => {
    await upsertSongs(db, threeSongs);
    // Simulate a preview cached earlier (the music API will do this in a later branch).
    await db.query(
      "UPDATE songs SET preview_url = $1, artwork_url = $2, store_url = $3, preview_cached_at = $4 WHERE title = 'Billie Jean'",
      ["https://example.com/preview.m4a", "https://example.com/art.jpg", "https://example.com/store", "2026-11-01T10:00:00Z"],
    );

    await upsertSongs(db, [{ title: "Billie Jean", artist: "Michael Jackson", year: 1982, genre: "pop" }]);

    const song = (await listSongs(db)).find((s) => s.title === "Billie Jean");
    expect(song?.year).toBe(1982);
    expect(song?.previewUrl).toBe("https://example.com/preview.m4a");
    expect(song?.artworkUrl).toBe("https://example.com/art.jpg");
    expect(song?.storeUrl).toBe("https://example.com/store");
    expect(song?.previewCachedAt?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
  });

  it("stores one row when the same song appears twice in one list", async () => {
    await upsertSongs(db, [
      { title: "Hey Jude", artist: "The Beatles", year: 1968, genre: "rock" },
      { title: "hey jude", artist: "the beatles", year: 1968, genre: "rock" },
    ]);
    expect(await listSongs(db)).toHaveLength(1);
  });

  it("does nothing for an empty list", async () => {
    await expect(upsertSongs(db, [])).resolves.toBeUndefined();
    expect(await listSongs(db)).toEqual([]);
  });

  it("listSongsWithoutPreview returns only songs without a cached preview", async () => {
    await upsertSongs(db, threeSongs);
    await db.query("UPDATE songs SET preview_url = 'https://example.com/p.m4a', preview_cached_at = now() WHERE title = 'Billie Jean'");

    const titles = (await listSongsWithoutPreview(db)).map((s) => s.title);
    expect(titles).toEqual(["Bohemian Rhapsody", "Hey Ya!"]);
  });

  it("stores apostrophes and quotes exactly as written", async () => {
    const tricky: SongInput[] = [
      { title: "Don't Stop Me Now", artist: "Queen", year: 1979, genre: "rock" },
      { title: 'Say "Hello"; DROP TABLE songs; --', artist: "Test", year: 2000, genre: "pop" },
    ];
    await upsertSongs(db, tricky);

    const titles = (await listSongs(db)).map((s) => s.title).sort();
    expect(titles).toEqual(["Don't Stop Me Now", 'Say "Hello"; DROP TABLE songs; --']);
  });
});
