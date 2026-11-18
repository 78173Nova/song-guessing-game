import { describe, expect, it } from "vitest";
import { countByGenreAndDecade, MIN_MATCHING_SONGS } from "@/lib/game/filters";

// How many playable songs each genre + decade has, so the start screen can grey out choices with too few
// (spec 003, "filter gaps"). Plain function: no database, no network.

const song = (id: number, genre: string, year: number) => ({ id, genre, year });

describe("MIN_MATCHING_SONGS", () => {
  it("is 5, the number of rounds in a game", () => {
    expect(MIN_MATCHING_SONGS).toBe(5);
  });
});

describe("countByGenreAndDecade", () => {
  it("counts the songs per genre and decade, using the decade of the year (1989 → 1980)", () => {
    const songs = [song(1, "rock", 1980), song(2, "rock", 1989), song(3, "rock", 1990), song(4, "pop", 1985)];
    expect(countByGenreAndDecade(songs)).toEqual([
      { genre: "pop", decade: 1980, count: 1 },
      { genre: "rock", decade: 1980, count: 2 },
      { genre: "rock", decade: 1990, count: 1 },
    ]);
  });

  it("lists only combinations that have songs (no entries with 0)", () => {
    const counts = countByGenreAndDecade([song(1, "hip-hop", 2021)]);
    expect(counts).toEqual([{ genre: "hip-hop", decade: 2020, count: 1 }]);
    expect(counts.some((c) => c.count === 0)).toBe(false);
  });

  it("keeps the 1957 song in its own decade 1950, so 'Any decade' totals stay correct", () => {
    expect(countByGenreAndDecade([song(1, "rock", 1957)])).toEqual([{ genre: "rock", decade: 1950, count: 1 }]);
  });

  it("is sorted by genre, then decade, so the reply is always the same for the same songs", () => {
    const songs = [song(1, "rock", 2001), song(2, "dance", 1999), song(3, "rock", 1975), song(4, "dance", 2010)];
    expect(countByGenreAndDecade(songs).map((c) => `${c.genre} ${c.decade}`)).toEqual([
      "dance 1990",
      "dance 2010",
      "rock 1970",
      "rock 2000",
    ]);
  });

  it("returns an empty list for no songs", () => {
    expect(countByGenreAndDecade([])).toEqual([]);
  });

  it("contains only genre, decade and count – nothing about single songs", () => {
    const [entry] = countByGenreAndDecade([{ id: 7, genre: "pop", year: 2000, title: "Secret", artist: "Someone" }]);
    expect(Object.keys(entry).sort()).toEqual(["count", "decade", "genre"]);
  });
});
