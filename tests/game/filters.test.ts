import { describe, expect, it } from "vitest";
import { DECADES, decadeOf, filterSongs, isDecade, tooFewSongsMessage } from "@/lib/game/filters";
import { GENRES } from "@/lib/game/genres";
import { parseStartInput } from "@/lib/game/modes";

// Genre and decade filters (spec 003, step 5). Plain functions: no database, no network.

const song = (id: number, genre: string, year: number) => ({ id, title: `Song ${id}`, artist: `Artist ${id}`, genre, year });

const SONGS = [
  song(1, "rock", 1983),
  song(2, "rock", 1989),
  song(3, "rock", 1990),
  song(4, "pop", 1980),
  song(5, "pop", 2026),
  song(6, "rock", 1957), // Jailhouse Rock: only with decade "Any"
];

describe("DECADES and decadeOf", () => {
  it("offers the 7 decades 1960s to 2020s", () => {
    expect(DECADES).toEqual([1960, 1970, 1980, 1990, 2000, 2010, 2020]);
  });

  it("works out the decade from the year", () => {
    expect(decadeOf(1980)).toBe(1980);
    expect(decadeOf(1987)).toBe(1980);
    expect(decadeOf(1989)).toBe(1980);
    expect(decadeOf(1990)).toBe(1990);
    expect(decadeOf(2026)).toBe(2020);
    expect(decadeOf(1957)).toBe(1950);
  });

  it("isDecade accepts only the 7 decades as numbers", () => {
    for (const decade of DECADES) expect(isDecade(decade)).toBe(true);
    for (const value of [1950, 2030, 1985, 0, -1980, 1980.5, "1980", null, undefined, [1980]]) {
      expect(isDecade(value), String(value)).toBe(false);
    }
  });
});

describe("filterSongs", () => {
  const ids = (songs: { id: number }[]) => songs.map((s) => s.id);

  it("keeps every song when no filter is chosen (Any + Any)", () => {
    expect(ids(filterSongs(SONGS, {}))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps only the chosen genre", () => {
    expect(ids(filterSongs(SONGS, { genre: "pop" }))).toEqual([4, 5]);
  });

  it("keeps only the chosen decade, including its first and last year", () => {
    expect(ids(filterSongs(SONGS, { decade: 1980 }))).toEqual([1, 2, 4]);
    expect(ids(filterSongs(SONGS, { decade: 2020 }))).toEqual([5]);
  });

  it("keeps only songs that match both", () => {
    expect(ids(filterSongs(SONGS, { genre: "rock", decade: 1980 }))).toEqual([1, 2]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterSongs(SONGS, { genre: "country" })).toEqual([]);
    expect(filterSongs(SONGS, { genre: "pop", decade: 1960 })).toEqual([]);
  });

  it("never picks the 1957 song for a decade filter, only for Any", () => {
    for (const decade of DECADES) expect(ids(filterSongs(SONGS, { decade }))).not.toContain(6);
    expect(ids(filterSongs(SONGS, { genre: "rock" }))).toContain(6);
  });
});

describe("parseStartInput – genre and decade", () => {
  it("accepts a genre, a decade, or both, together with a mode", () => {
    expect(parseStartInput({ genre: "rock" })).toEqual({ ok: true, mode: "title", genre: "rock" });
    expect(parseStartInput({ decade: 1980 })).toEqual({ ok: true, mode: "title", decade: 1980 });
    expect(parseStartInput({ mode: "artist", genre: "r&b", decade: 2020 })).toEqual({
      ok: true,
      mode: "artist",
      genre: "r&b",
      decade: 2020,
    });
  });

  it("accepts every genre from the fixed list and every decade", () => {
    for (const genre of GENRES) expect(parseStartInput({ genre })).toMatchObject({ ok: true, genre });
    for (const decade of DECADES) expect(parseStartInput({ decade })).toMatchObject({ ok: true, decade });
  });

  it("missing genre and decade mean Any: they are not in the result", () => {
    const result = parseStartInput({ mode: "year" });
    expect(result).toEqual({ ok: true, mode: "year" });
    expect(result).not.toHaveProperty("genre", expect.anything());
    expect(result).not.toHaveProperty("decade", expect.anything());
  });

  it("rejects an unknown genre", () => {
    for (const genre of ["Rock", "soul", "jazz", "", " rock", "any", "x".repeat(500)]) {
      expect(parseStartInput({ genre }), genre).toEqual({ ok: false, error: "invalid-genre" });
    }
  });

  it("rejects a decade that is not one of 1960, 1970 … 2020", () => {
    for (const decade of [1950, 2030, 1985, 0, -1980, 1980.5, 19800]) {
      expect(parseStartInput({ decade }), String(decade)).toEqual({ ok: false, error: "invalid-decade" });
    }
  });

  it("rejects wrong types and unknown extra fields as malformed", () => {
    const bodies = [
      { genre: 1 },
      { genre: ["rock"] },
      { genre: null },
      { genre: { name: "rock" } },
      { decade: "1980" },
      { decade: [1980] },
      { decade: null },
      { decade: true },
      { genre: "rock", era: "80s" },
      { mode: "title", genre: "rock", decade: 1980, rounds: 10 },
    ];
    for (const body of bodies) {
      expect(parseStartInput(body), JSON.stringify(body)).toEqual({ ok: false, error: "malformed" });
    }
  });
});

describe("tooFewSongsMessage", () => {
  it("says how many songs match and what to try", () => {
    expect(tooFewSongsMessage(0)).toBe("No songs match these filters – try 'Any' for genre or decade.");
    expect(tooFewSongsMessage(1)).toBe("Only 1 song matches these filters – try 'Any' for genre or decade.");
    expect(tooFewSongsMessage(3)).toBe("Only 3 songs match these filters – try 'Any' for genre or decade.");
  });

  it("with 5 or more songs, says the songs are too alike for this mode (e.g. all by one artist)", () => {
    expect(tooFewSongsMessage(5)).toBe(
      "These filters match too few different titles or artists for this mode – try 'Any' for genre or decade, or another mode.",
    );
  });
});
