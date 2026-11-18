import { describe, expect, it } from "vitest";
import { canChoose, filterNotes, matchingCount } from "@/lib/client/filter-choices";
import type { SongCount } from "@/lib/game/filters";

// Which genre and decade choices the start screen offers (spec 003, "filter gaps"). Plain functions, no network.
// The server still refuses a combination with too few songs; this only stops the player choosing it.

const COUNTS: SongCount[] = [
  { genre: "rock", decade: 1950, count: 1 }, // Jailhouse Rock
  { genre: "rock", decade: 1960, count: 8 },
  { genre: "rock", decade: 1980, count: 10 },
  { genre: "hip-hop", decade: 1980, count: 9 },
  { genre: "hip-hop", decade: 2020, count: 4 }, // too few
  { genre: "pop", decade: 1960, count: 5 }, // exactly enough
  { genre: "country", decade: 1960, count: 2 },
  { genre: "country", decade: 1970, count: 3 }, // country has 5 in total, but no decade with 5
];

describe("matchingCount", () => {
  it("one genre and one decade: the count of that combination", () => {
    expect(matchingCount(COUNTS, { genre: "rock", decade: 1980 })).toBe(10);
  });

  it("a combination that is not listed has 0 songs", () => {
    expect(matchingCount(COUNTS, { genre: "hip-hop", decade: 1960 })).toBe(0);
  });

  it("only a genre: all its decades together, including the 1957 song", () => {
    expect(matchingCount(COUNTS, { genre: "rock" })).toBe(19);
  });

  it("only a decade: all genres of that decade together", () => {
    expect(matchingCount(COUNTS, { decade: 1960 })).toBe(15);
  });

  it("Any + Any: every song", () => {
    expect(matchingCount(COUNTS, {})).toBe(42);
  });
});

describe("canChoose", () => {
  it("allows a combination with 5 or more songs", () => {
    expect(canChoose(COUNTS, { genre: "pop", decade: 1960 })).toBe(true);
    expect(canChoose(COUNTS, { genre: "rock", decade: 1980 })).toBe(true);
  });

  it("refuses a combination with fewer than 5 songs, or none", () => {
    expect(canChoose(COUNTS, { genre: "hip-hop", decade: 2020 })).toBe(false);
    expect(canChoose(COUNTS, { genre: "hip-hop", decade: 1960 })).toBe(false);
  });

  it("a genre with 'Any' decade counts all its decades together", () => {
    expect(canChoose(COUNTS, { genre: "country" })).toBe(true);
  });

  it("a genre with no songs at all cannot be chosen, even with 'Any' decade", () => {
    expect(canChoose(COUNTS, { genre: "dance" })).toBe(false);
  });

  it("when the counts could not be loaded (null), allows everything – the server still checks", () => {
    expect(canChoose(null, { genre: "hip-hop", decade: 1960 })).toBe(true);
  });
});

describe("filterNotes – the short note under the dropdowns", () => {
  it("genre chosen, some decades greyed out: says why, with the genre's screen name", () => {
    expect(filterNotes(COUNTS, { genre: "hip-hop" })).toEqual([
      "Greyed-out decades have fewer than 5 Hip-hop songs.",
    ]);
  });

  it("decade chosen, some genres greyed out: says why, with the decade", () => {
    expect(filterNotes(COUNTS, { decade: 2020 })).toEqual([
      "Greyed-out genres have fewer than 5 songs from the 2020s.",
    ]);
  });

  it("both chosen: both notes, genre first", () => {
    expect(filterNotes(COUNTS, { genre: "rock", decade: 1960 })).toEqual([
      "Greyed-out decades have fewer than 5 Rock songs.",
      "Greyed-out genres have fewer than 5 songs from the 1960s.",
    ]);
  });

  it("no note when nothing is greyed out", () => {
    const full: SongCount[] = ["pop", "rock", "hip-hop", "r&b", "dance", "country"].flatMap((genre) =>
      [1960, 1970, 1980, 1990, 2000, 2010, 2020].map((decade) => ({ genre, decade, count: 5 })),
    );
    expect(filterNotes(full, { genre: "rock" })).toEqual([]);
    expect(filterNotes(full, { decade: 1990 })).toEqual([]);
  });

  it("no note for Any + Any, and none when the counts could not be loaded", () => {
    expect(filterNotes(COUNTS, {})).toEqual([]);
    expect(filterNotes(null, { genre: "hip-hop" })).toEqual([]);
  });
});
