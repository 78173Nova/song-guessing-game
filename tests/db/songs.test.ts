import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import {
  listSongs,
  listSongsWithoutPreview,
  listSongsWithPreview,
  setCatalogue,
  upsertSongs,
  type SongInput,
} from "@/lib/db/songs";
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
        inCatalogue: true,
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

describe("setCatalogue", () => {
  const catalogueOf = async () =>
    Object.fromEntries((await listSongs(db)).map((s) => [s.title, s.inCatalogue]));

  it("keeps listed songs in the catalogue and retires every other song – without deleting any row", async () => {
    await upsertSongs(db, threeSongs);

    await setCatalogue(db, [threeSongs[0], threeSongs[2]]);

    expect(await catalogueOf()).toEqual({ "Bohemian Rhapsody": true, "Billie Jean": false, "Hey Ya!": true });
    expect(await listSongs(db)).toHaveLength(3);
  });

  it("brings a retired song back when it is listed again", async () => {
    await upsertSongs(db, threeSongs);
    await setCatalogue(db, [threeSongs[0]]);

    await setCatalogue(db, threeSongs);

    expect(await catalogueOf()).toEqual({ "Bohemian Rhapsody": true, "Billie Jean": true, "Hey Ya!": true });
  });

  it("matches artist and title ignoring upper/lower case, like the unique index", async () => {
    await upsertSongs(db, threeSongs);

    await setCatalogue(db, [{ title: "billie jean", artist: "MICHAEL JACKSON", year: 1982, genre: "pop" }]);

    expect(await catalogueOf()).toEqual({ "Bohemian Rhapsody": false, "Billie Jean": true, "Hey Ya!": false });
  });

  it("needs both artist and title to match (same title by another artist is retired)", async () => {
    await upsertSongs(db, [
      { title: "Hurt", artist: "Nine Inch Nails", year: 1994, genre: "rock" },
      { title: "Hurt", artist: "Johnny Cash", year: 2002, genre: "country" },
    ]);

    await setCatalogue(db, [{ title: "Hurt", artist: "Johnny Cash", year: 2002, genre: "country" }]);

    const songs = await listSongs(db);
    expect(songs.map((s) => [s.artist, s.inCatalogue])).toEqual([
      ["Nine Inch Nails", false],
      ["Johnny Cash", true],
    ]);
  });

  it("keeps the cached preview of a retired song (nothing but in_catalogue changes)", async () => {
    await upsertSongs(db, threeSongs);
    await db.query("UPDATE songs SET preview_url = 'https://example.com/p.m4a', preview_cached_at = now() WHERE title = 'Billie Jean'");
    const before = (await listSongs(db)).find((s) => s.title === "Billie Jean");

    await setCatalogue(db, [threeSongs[0]]);

    const after = (await listSongs(db)).find((s) => s.title === "Billie Jean");
    expect(after).toEqual({ ...before, inCatalogue: false });
  });

  it("refuses an empty list and changes nothing, because that would retire every song", async () => {
    await upsertSongs(db, threeSongs);

    await expect(setCatalogue(db, [])).rejects.toThrow();

    expect(Object.values(await catalogueOf())).toEqual([true, true, true]);
  });

  it("handles apostrophes and quotes in titles", async () => {
    const tricky: SongInput[] = [
      { title: "Don't Stop Me Now", artist: "Queen", year: 1978, genre: "rock" },
      { title: 'Say "Hello"; DROP TABLE songs; --', artist: "Test", year: 2000, genre: "pop" },
    ];
    await upsertSongs(db, tricky);

    await setCatalogue(db, [tricky[0]]);

    expect(await catalogueOf()).toEqual({ "Don't Stop Me Now": true, 'Say "Hello"; DROP TABLE songs; --': false });
  });
});

describe("retired songs are left out", () => {
  beforeEach(async () => {
    await upsertSongs(db, threeSongs);
    // Every song has a preview except Hey Ya!, then Billie Jean and Hey Ya! are retired.
    await db.query("UPDATE songs SET preview_url = 'https://example.com/p.m4a', preview_cached_at = now() WHERE title <> 'Hey Ya!'");
    await setCatalogue(db, [threeSongs[0]]);
  });

  it("listSongsWithPreview (what the game plays) returns only catalogue songs with a preview", async () => {
    expect((await listSongsWithPreview(db)).map((s) => s.title)).toEqual(["Bohemian Rhapsody"]);
  });

  it("listSongsWithoutPreview (what the seed looks up on iTunes) skips retired songs", async () => {
    expect(await listSongsWithoutPreview(db)).toEqual([]);
  });

  it("listSongs still returns every song, retired or not", async () => {
    expect((await listSongs(db)).map((s) => s.title)).toEqual(["Bohemian Rhapsody", "Billie Jean", "Hey Ya!"]);
  });
});
