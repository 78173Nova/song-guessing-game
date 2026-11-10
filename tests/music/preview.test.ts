import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { listSongs, upsertSongs, type Song } from "@/lib/db/songs";
import { MUSIC_UNAVAILABLE_MESSAGE, type PreviewLookup } from "@/lib/music/itunes";
import { fillMissingPreviews, getPreview } from "@/lib/music/preview";
import { createTestDb } from "../helpers/test-db";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

const NOW = new Date("2026-11-10T12:00:00Z");

function found(name: string): PreviewLookup {
  return {
    ok: true,
    previewUrl: `https://audio.example.com/${name}.m4a`,
    artworkUrl: `https://art.example.com/${name}.jpg`,
    storeUrl: `https://music.example.com/${name}`,
  };
}

const unavailable: PreviewLookup = { ok: false, reason: "unavailable", message: MUSIC_UNAVAILABLE_MESSAGE };

async function songByTitle(title: string): Promise<Song> {
  const song = (await listSongs(db)).find((s) => s.title === title);
  if (!song) throw new Error(`test song missing: ${title}`);
  return song;
}

async function addCachedSong(title: string) {
  await upsertSongs(db, [{ title, artist: "Cached Artist", year: 2000, genre: "pop" }]);
  await db.query(
    "UPDATE songs SET preview_url = $1, artwork_url = $2, store_url = $3, preview_cached_at = $4 WHERE title = $5",
    ["https://audio.example.com/cached.m4a", "https://art.example.com/cached.jpg", "https://music.example.com/cached", "2026-11-01T10:00:00Z", title],
  );
}

describe("getPreview", () => {
  it("uses the cached preview and does not call iTunes", async () => {
    await addCachedSong("Cached Song");
    const lookup = vi.fn();

    const result = await getPreview(db, await songByTitle("Cached Song"), { lookup, now: () => NOW });

    expect(result).toEqual({
      ok: true,
      previewUrl: "https://audio.example.com/cached.m4a",
      artworkUrl: "https://art.example.com/cached.jpg",
      storeUrl: "https://music.example.com/cached",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("looks up an uncached song and saves the result", async () => {
    await upsertSongs(db, [{ title: "Africa", artist: "Toto", year: 1982, genre: "rock" }]);
    const lookup = vi.fn(async () => found("africa"));

    const result = await getPreview(db, await songByTitle("Africa"), { lookup, now: () => NOW });

    expect(result).toEqual(found("africa"));
    expect(lookup).toHaveBeenCalledWith({ artist: "Toto", title: "Africa" });
    expect(await songByTitle("Africa")).toMatchObject({
      previewUrl: "https://audio.example.com/africa.m4a",
      artworkUrl: "https://art.example.com/africa.jpg",
      storeUrl: "https://music.example.com/africa",
      previewCachedAt: NOW,
    });
  });

  it("returns the failure and leaves the database unchanged when the lookup fails", async () => {
    await upsertSongs(db, [{ title: "Africa", artist: "Toto", year: 1982, genre: "rock" }]);
    const lookup = vi.fn(async () => unavailable);

    const result = await getPreview(db, await songByTitle("Africa"), { lookup, now: () => NOW });

    expect(result).toEqual(unavailable);
    expect(await songByTitle("Africa")).toMatchObject({
      previewUrl: null,
      artworkUrl: null,
      storeUrl: null,
      previewCachedAt: null,
    });
  });
});

describe("fillMissingPreviews", () => {
  it("looks up only uncached songs and waits between requests, not before or after", async () => {
    await upsertSongs(db, [
      { title: "First", artist: "A", year: 2000, genre: "pop" },
      { title: "Second", artist: "B", year: 2000, genre: "pop" },
    ]);
    await addCachedSong("Already Cached");
    const lookup = vi.fn(async (song: { title: string }) => found(song.title));
    const wait = vi.fn(async () => {});

    const summary = await fillMissingPreviews(db, { lookup, wait, now: () => NOW });

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup.mock.calls.map((c) => c[0].title)).toEqual(["First", "Second"]);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(3500);
    expect(summary).toEqual({ found: 2, failed: [] });
  });

  it("keeps going after a failed song and reports it", async () => {
    await upsertSongs(db, [
      { title: "Fails", artist: "A", year: 2000, genre: "pop" },
      { title: "Works", artist: "B", year: 2000, genre: "pop" },
    ]);
    const lookup = vi.fn(async (song: { title: string }) => (song.title === "Fails" ? unavailable : found("works")));
    const wait = vi.fn(async () => {});

    const summary = await fillMissingPreviews(db, { lookup, wait, now: () => NOW });

    expect(summary).toEqual({
      found: 1,
      failed: [{ artist: "A", title: "Fails", reason: "unavailable" }],
    });
    expect((await songByTitle("Works")).previewUrl).toBe("https://audio.example.com/works.m4a");
    expect((await songByTitle("Fails")).previewUrl).toBeNull();
  });
});
