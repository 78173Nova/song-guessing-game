import { describe, expect, it } from "vitest";
import { parseFiltersQuery } from "@/lib/game/filters";
import { MODES } from "@/lib/game/modes";
import { buildRounds, countMatching, modeFits, type MatchingCounts } from "@/lib/game/rounds";

// The three numbers the solo start screen gets for the chosen genre + decade (team feedback 18 Nov, point 7):
// songs, different titles, different artists – and the rule that says which modes can start with them. Plain
// functions: no database, no network. The rule must agree with buildRounds, which the server uses to refuse a game
// on its own.

const song = (id: number, title: string, artist: string, year = 1985) => ({ id, title, artist, year });

describe("countMatching", () => {
  it("counts songs, different titles and different artists", () => {
    const songs = [song(1, "A", "X"), song(2, "B", "Y"), song(3, "C", "X")];
    expect(countMatching(songs)).toEqual({ songs: 3, titles: 3, artists: 2 });
  });

  it("ignores upper/lower case and spaces around, like the answer options do ('Queen' = 'queen ')", () => {
    const songs = [song(1, "Happy", "Queen"), song(2, "happy ", "queen "), song(3, " HAPPY", "QUEEN")];
    expect(countMatching(songs)).toEqual({ songs: 3, titles: 1, artists: 1 });
  });

  it("gives three zeros for no songs", () => {
    expect(countMatching([])).toEqual({ songs: 0, titles: 0, artists: 0 });
  });

  it("contains only the three numbers – nothing about single songs", () => {
    expect(Object.keys(countMatching([song(1, "Secret", "Someone")])).sort()).toEqual(["artists", "songs", "titles"]);
  });
});

describe("modeFits – can a game in this mode start with these songs?", () => {
  const counts = (songs: number, titles: number, artists: number): MatchingCounts => ({ songs, titles, artists });

  it("every mode needs at least 5 songs", () => {
    for (const mode of MODES) {
      expect(modeFits(counts(4, 4, 4), mode)).toBe(false);
      expect(modeFits(counts(5, 5, 5), mode)).toBe(true);
    }
  });

  it("title mode needs 4 different titles", () => {
    expect(modeFits(counts(5, 3, 5), "title")).toBe(false);
    expect(modeFits(counts(5, 4, 1), "title")).toBe(true);
  });

  it("artist mode needs 4 different artists", () => {
    expect(modeFits(counts(5, 5, 3), "artist")).toBe(false);
    expect(modeFits(counts(5, 1, 4), "artist")).toBe(true);
  });

  it("mixed mode needs both: it can ask for the title and for the artist", () => {
    expect(modeFits(counts(5, 5, 3), "mixed")).toBe(false);
    expect(modeFits(counts(5, 3, 5), "mixed")).toBe(false);
    expect(modeFits(counts(5, 4, 4), "mixed")).toBe(true);
  });

  it("year mode only needs 5 songs: its wrong years are calculated", () => {
    expect(modeFits(counts(5, 1, 1), "year")).toBe(true);
  });
});

describe("modeFits agrees with buildRounds (the server's own check)", () => {
  // Song lists around the limits: few titles, few artists, too few songs, everything fine.
  const pools = {
    "6 songs, all different": [1, 2, 3, 4, 5, 6].map((i) => song(i, `T${i}`, `A${i}`)),
    "5 songs, 2 artists": [1, 2, 3, 4, 5].map((i) => song(i, `T${i}`, i % 2 === 0 ? "Queen" : "ABBA")),
    "5 songs, 3 artists (case differs)": [1, 2, 3, 4, 5].map((i) => song(i, `T${i}`, ["Queen", "queen", "ABBA", "Muse", "MUSE"][i - 1])),
    "5 songs, 3 titles": [1, 2, 3, 4, 5].map((i) => song(i, ["Happy", "happy", "Hello", "Hello", "Home"][i - 1], `A${i}`)),
    "5 songs, 4 titles, 4 artists": [1, 2, 3, 4, 5].map((i) => song(i, `T${Math.min(i, 4)}`, `A${Math.min(i, 4)}`)),
    "4 songs": [1, 2, 3, 4].map((i) => song(i, `T${i}`, `A${i}`)),
    "no songs": [],
  };

  for (const [name, songs] of Object.entries(pools)) {
    it(`${name}: same answer for every mode`, () => {
      for (const mode of MODES) {
        const built = buildRounds(songs, () => 0.5, { mode, currentYear: 2026 });
        expect({ mode, fits: modeFits(countMatching(songs), mode) }).toEqual({ mode, fits: built.ok });
      }
    });
  }
});

describe("parseFiltersQuery – genre and decade from the query string", () => {
  const parse = (query: string) => parseFiltersQuery(new URLSearchParams(query));

  it("no genre and no decade = Any + Any", () => {
    expect(parse("")).toEqual({ ok: true, filters: {} });
  });

  it("reads one genre and one decade", () => {
    expect(parse("genre=rock&decade=1980")).toEqual({ ok: true, filters: { genre: "rock", decade: 1980 } });
    expect(parse("genre=r%26b")).toEqual({ ok: true, filters: { genre: "r&b" } });
    expect(parse("decade=2020")).toEqual({ ok: true, filters: { decade: 2020 } });
  });

  it("refuses a genre that is not on the list, also an empty one or other spelling", () => {
    for (const genre of ["jazz", "", "Rock", " rock", "rock,pop", "x".repeat(1000)]) {
      expect(parse(`genre=${encodeURIComponent(genre)}`)).toEqual({ ok: false, error: "invalid-genre" });
    }
  });

  it("refuses a decade that is not one of 1960 … 2020", () => {
    for (const decade of ["1985", "1950", "2030", "abc", "", "1980.0", "01980", "1980,1990", " 1980"]) {
      expect(parse(`decade=${encodeURIComponent(decade)}`)).toEqual({ ok: false, error: "invalid-decade" });
    }
  });

  it("refuses a filter given twice and any other field", () => {
    expect(parse("genre=rock&genre=pop")).toEqual({ ok: false, error: "malformed" });
    expect(parse("decade=1980&decade=1990")).toEqual({ ok: false, error: "malformed" });
    expect(parse("genre=rock&mode=title")).toEqual({ ok: false, error: "malformed" });
    expect(parse("genres=rock")).toEqual({ ok: false, error: "malformed" });
  });
});
