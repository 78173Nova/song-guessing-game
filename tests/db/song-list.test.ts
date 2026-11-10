import { describe, expect, it } from "vitest";
import { songList } from "@/db/songs";

// Checks the song data itself (no database).
describe("db/songs.ts – the seed song list", () => {
  it("has between 25 and 35 songs, enough for a 10-round game", () => {
    expect(songList.length).toBeGreaterThanOrEqual(25);
    expect(songList.length).toBeLessThanOrEqual(35);
  });

  it("gives every song a title, artist, genre and a plausible original year", () => {
    const thisYear = new Date().getFullYear();
    for (const song of songList) {
      expect(song.title.trim(), JSON.stringify(song)).not.toBe("");
      expect(song.artist.trim(), JSON.stringify(song)).not.toBe("");
      expect(song.genre.trim(), JSON.stringify(song)).not.toBe("");
      expect(Number.isInteger(song.year), JSON.stringify(song)).toBe(true);
      expect(song.year, JSON.stringify(song)).toBeGreaterThanOrEqual(1950);
      expect(song.year, JSON.stringify(song)).toBeLessThanOrEqual(thisYear);
    }
  });

  it("has no song twice (same artist + title, ignoring upper/lower case)", () => {
    const keys = songList.map((s) => `${s.artist.toLowerCase()}|${s.title.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
