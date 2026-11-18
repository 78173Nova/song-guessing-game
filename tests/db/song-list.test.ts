import { describe, expect, it } from "vitest";
import { songList } from "@/db/songs";
import { GENRES } from "@/lib/game/genres";

// The one song allowed before 1960 (spec 003): it stays from the base list and only plays under decade "Any".
const JAILHOUSE_ROCK = { artist: "Elvis Presley", title: "Jailhouse Rock", year: 1957 };
const FIRST_YEAR = 1960;
const LAST_YEAR = 2026;

const MIN_SONGS = 300;
const MIN_PER_GENRE = 30;
const MIN_PER_DECADE = 35;
const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];

const describeSong = (song: unknown) => JSON.stringify(song);

// Checks the song data itself (no database), including the size rules from spec 003:
// 300+ songs, at least 30 per genre and at least 35 per decade (1960s–2020s).
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

  it("has at least 300 songs", () => {
    expect(songList.length).toBeGreaterThanOrEqual(MIN_SONGS);
  });

  it.each(GENRES)("has at least 30 songs in genre %s", (genre) => {
    const count = songList.filter((song) => song.genre === genre).length;
    expect(count).toBeGreaterThanOrEqual(MIN_PER_GENRE);
  });

  it.each(DECADES)("has at least 35 songs in the %ss", (decade) => {
    const count = songList.filter((song) => song.year >= decade && song.year <= decade + 9).length;
    expect(count).toBeGreaterThanOrEqual(MIN_PER_DECADE);
  });

  // Filter gaps (spec 003): 2020s hip-hop had only 1 song, so the filter could never start a game.
  it("has at least 5 hip-hop songs from the 2020s", () => {
    const count = songList.filter((song) => song.genre === "hip-hop" && song.year >= 2020).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
