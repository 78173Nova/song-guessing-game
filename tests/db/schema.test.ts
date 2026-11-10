import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { applySchema } from "@/lib/db/schema";
import { createTestDb } from "../helpers/test-db";

// These tests use plain SQL on purpose: they check the rules of the table itself,
// independent of the functions in lib/db/.
let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

function insertSong(title: string, artist: string, year: number, genre: string) {
  return db.query("INSERT INTO songs (title, artist, year, genre) VALUES ($1, $2, $3, $4)", [
    title,
    artist,
    year,
    genre,
  ]);
}

describe("db/schema.sql", () => {
  it("creates the songs table with exactly the columns from the spec", async () => {
    const rows = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'songs' ORDER BY column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      "artist",
      "artwork_url",
      "genre",
      "id",
      "preview_cached_at",
      "preview_url",
      "store_url",
      "title",
      "year",
    ]);
  });

  it("can be loaded twice without errors, so the seed can run again", async () => {
    await expect(applySchema(db)).resolves.toBeUndefined();
  });

  it("rejects a song with an empty title, artist or genre", async () => {
    await expect(insertSong("", "Queen", 1975, "rock")).rejects.toThrow();
    await expect(insertSong("Bohemian Rhapsody", "  ", 1975, "rock")).rejects.toThrow();
    await expect(insertSong("Bohemian Rhapsody", "Queen", 1975, "")).rejects.toThrow();
  });

  it("rejects years outside 1900–2100 and accepts the edges", async () => {
    await expect(insertSong("Too Old", "Someone", 1899, "pop")).rejects.toThrow();
    await expect(insertSong("Too New", "Someone", 2101, "pop")).rejects.toThrow();
    await expect(insertSong("Oldest", "Someone", 1900, "pop")).resolves.toBeDefined();
    await expect(insertSong("Newest", "Someone", 2100, "pop")).resolves.toBeDefined();
  });

  it("rejects the same artist + title twice, ignoring upper/lower case", async () => {
    await insertSong("Bohemian Rhapsody", "Queen", 1975, "rock");
    await expect(insertSong("Bohemian Rhapsody", "Queen", 1975, "rock")).rejects.toThrow();
    await expect(insertSong("bohemian rhapsody", "queen", 1975, "rock")).rejects.toThrow();
  });
});
