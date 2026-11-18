import { describe, expect, it } from "vitest";
import { canPickMode, decadeFromTile, genreFromTile, matchLine, modeNotes, modeProblem } from "@/lib/client/solo-settings";
import type { MatchingCounts } from "@/lib/game/rounds";

// The solo start screen as tiles (team feedback 18 Nov, points 7 and 8), as plain functions. No browser, no network.
// Solo stays single choice: one genre and one decade, "Any" by default. The server still refuses every game
// that cannot start; this only stops the player choosing it and says why.

const counts = (songs: number, titles: number, artists: number): MatchingCounts => ({ songs, titles, artists });

describe("genreFromTile / decadeFromTile – one tile = one choice", () => {
  it("'Any' means no filter", () => {
    expect(genreFromTile("any")).toBeUndefined();
    expect(decadeFromTile("any")).toBeUndefined();
  });

  it("a genre or decade tile gives that genre or decade", () => {
    expect(genreFromTile("r&b")).toBe("r&b");
    expect(decadeFromTile("1980")).toBe(1980);
    expect(decadeFromTile("2020")).toBe(2020);
  });

  it("anything that is not a tile gives 'Any'", () => {
    expect(genreFromTile("jazz")).toBeUndefined();
    expect(genreFromTile("Rock")).toBeUndefined();
    expect(decadeFromTile("1985")).toBeUndefined();
    expect(decadeFromTile("1950")).toBeUndefined();
    expect(decadeFromTile("abc")).toBeUndefined();
  });
});

describe("matchLine – the line above 'Start game'", () => {
  it("enough songs: how many match and that 5 will be played", () => {
    expect(matchLine(counts(12, 12, 9))).toEqual({ text: "12 songs match – 5 will be played.", tooFew: false });
    expect(matchLine(counts(5, 5, 5))).toEqual({ text: "5 songs match – 5 will be played.", tooFew: false });
  });

  it("fewer than 5 songs: the same message the server sends, marked as too few", () => {
    expect(matchLine(counts(3, 3, 3))).toEqual({
      text: "Only 3 songs match these filters – try 'Any' for genre or decade.",
      tooFew: true,
    });
    expect(matchLine(counts(0, 0, 0))).toEqual({
      text: "No songs match these filters – try 'Any' for genre or decade.",
      tooFew: true,
    });
  });

  it("numbers not loaded (yet, or failed): only says how many will be played, nothing is blocked", () => {
    expect(matchLine(null)).toEqual({ text: "5 songs will be played.", tooFew: false });
  });
});

describe("canPickMode – which mode tiles are greyed out", () => {
  it("title needs 4 different titles, artist 4 different artists, mixed both, year neither", () => {
    const fewArtists = counts(5, 5, 3);
    expect(canPickMode(fewArtists, "title")).toBe(true);
    expect(canPickMode(fewArtists, "artist")).toBe(false);
    expect(canPickMode(fewArtists, "year")).toBe(true);
    expect(canPickMode(fewArtists, "mixed")).toBe(false);

    const fewTitles = counts(5, 3, 5);
    expect(canPickMode(fewTitles, "title")).toBe(false);
    expect(canPickMode(fewTitles, "artist")).toBe(true);
    expect(canPickMode(fewTitles, "year")).toBe(true);
    expect(canPickMode(fewTitles, "mixed")).toBe(false);
  });

  it("exactly 4 different titles and artists is enough for every mode", () => {
    for (const mode of ["title", "artist", "year", "mixed"] as const) {
      expect(canPickMode(counts(5, 4, 4), mode)).toBe(true);
    }
  });

  it("fewer than 5 songs greys out no mode: the filters are the problem, and the match line says so", () => {
    for (const mode of ["title", "artist", "year", "mixed"] as const) {
      expect(canPickMode(counts(3, 2, 1), mode)).toBe(true);
    }
  });

  it("numbers not loaded (null): every mode can be picked – the server still checks", () => {
    expect(canPickMode(null, "artist")).toBe(true);
  });
});

describe("modeNotes – the short note under the mode tiles", () => {
  it("too few artists: says which modes and why", () => {
    expect(modeNotes(counts(5, 5, 2))).toEqual(["Artist and Mixed need 4 different artists – these filters have only 2."]);
  });

  it("too few titles: says which modes and why", () => {
    expect(modeNotes(counts(6, 3, 6))).toEqual(["Title and Mixed need 4 different titles – these filters have only 3."]);
  });

  it("both too few: both notes, titles first", () => {
    expect(modeNotes(counts(5, 3, 2))).toEqual([
      "Title and Mixed need 4 different titles – these filters have only 3.",
      "Artist and Mixed need 4 different artists – these filters have only 2.",
    ]);
  });

  it("no note when every mode works, when there are fewer than 5 songs, or when the numbers are missing", () => {
    expect(modeNotes(counts(12, 12, 9))).toEqual([]);
    expect(modeNotes(counts(3, 1, 1))).toEqual([]);
    expect(modeNotes(null)).toEqual([]);
  });
});

describe("modeProblem – the chosen mode stopped working after a filter change", () => {
  // Proposal: the chosen mode stays chosen (greyed out), "Start game" is disabled and this message says why.
  // Nothing is switched without the player noticing.
  it("artist or mixed with too few artists: names the mode and what to do", () => {
    expect(modeProblem(counts(5, 5, 2), "artist")).toBe(
      "Artist needs 4 different artists – these filters have only 2. Choose another mode or other filters.",
    );
    expect(modeProblem(counts(5, 5, 2), "mixed")).toBe(
      "Mixed needs 4 different artists – these filters have only 2. Choose another mode or other filters.",
    );
  });

  it("title or mixed with too few titles: names the mode and what to do (titles first for mixed)", () => {
    expect(modeProblem(counts(5, 3, 5), "title")).toBe(
      "Title needs 4 different titles – these filters have only 3. Choose another mode or other filters.",
    );
    expect(modeProblem(counts(5, 3, 2), "mixed")).toBe(
      "Mixed needs 4 different titles – these filters have only 3. Choose another mode or other filters.",
    );
  });

  it("no problem when the mode works, when there are fewer than 5 songs (the match line covers it), or no numbers", () => {
    expect(modeProblem(counts(5, 5, 2), "title")).toBeNull();
    expect(modeProblem(counts(5, 5, 2), "year")).toBeNull();
    expect(modeProblem(counts(3, 1, 1), "artist")).toBeNull();
    expect(modeProblem(null, "artist")).toBeNull();
  });
});
