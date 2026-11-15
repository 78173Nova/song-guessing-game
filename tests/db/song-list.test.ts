import { describe, expect, it } from "vitest";
import { songList } from "@/db/songs";
import { GENRES } from "@/lib/game/genres";

// The one song allowed before 1960 (spec 003): it stays from the base list and only plays under decade "Any".
const JAILHOUSE_ROCK = { artist: "Elvis Presley", title: "Jailhouse Rock", year: 1957 };
const FIRST_YEAR = 1960;
const LAST_YEAR = 2026;

const describeSong = (song: unknown) => JSON.stringify(song);

// Checks the song data itself (no database). The size rules (300+ songs, 30 per genre, 35 per decade)
// are added with the last decade on feature/songs (spec 003, step 3).
describe("db/songs.ts – the seed song list", () => {
  it("gives every song a non-empty title and artist", () => {
    for (const song of songList) {
      expect(song.title.trim(), describeSong(song)).not.toBe("");
      expect(song.artist.trim(), describeSong(song)).not.toBe("");
    }
  });

  it("uses only genres from the fixed genre list", () => {
    for (const song of songList) {
      expect(GENRES, describeSong(song)).toContain(song.genre);
    }
  });

  it("has no 'soul' songs any more (they are 'r&b' now)", () => {
    expect(songList.filter((song) => song.genre === "soul")).toEqual([]);
  });

  it("gives every song a whole-number year from 1960 to 2026", () => {
    for (const song of songList) {
      if (song.artist === JAILHOUSE_ROCK.artist && song.title === JAILHOUSE_ROCK.title) continue;
      expect(Number.isInteger(song.year), describeSong(song)).toBe(true);
      expect(song.year, describeSong(song)).toBeGreaterThanOrEqual(FIRST_YEAR);
      expect(song.year, describeSong(song)).toBeLessThanOrEqual(LAST_YEAR);
    }
  });

  it("allows only Jailhouse Rock (1957) outside 1960–2026", () => {
    const outside = songList.filter((song) => song.year < FIRST_YEAR || song.year > LAST_YEAR);
    expect(outside.map((s) => ({ artist: s.artist, title: s.title, year: s.year }))).toEqual([JAILHOUSE_ROCK]);
  });

  it("has no song twice (same artist + title, ignoring upper/lower case)", () => {
    const keys = songList.map((s) => `${s.artist.toLowerCase()}|${s.title.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
