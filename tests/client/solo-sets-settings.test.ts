import { describe, expect, it } from "vitest";
import { canChoose, filterNotes } from "@/lib/client/filter-choices";
import { canPickMode, matchLine, modeProblem } from "@/lib/client/solo-settings";
import { modeFits } from "@/lib/game/rounds";

const counts = (songs: number) => ({ songs, titles: songs, artists: songs });

describe("the solo start screen follows the chosen game length", () => {
  it("a game needs as many songs as it has rounds", () => {
    expect(modeFits(counts(9), "title", 10)).toBe(false);
    expect(modeFits(counts(10), "title", 10)).toBe(true);
    expect(modeFits(counts(4), "title", 3)).toBe(true);
  });

  it("warns when the chosen game is longer than the matching songs", () => {
    expect(matchLine(counts(7), 9)).toBe("Only 7 songs match. Choose fewer songs, or try 'Any' for genre or decade.");
    expect(matchLine(counts(9), 9)).toBeNull();
  });

  it("4 matching songs are enough for a game of 3", () => {
    expect(matchLine(counts(4), 3)).toBeNull();
    expect(canPickMode(counts(4), "title", 3)).toBe(true);
    expect(modeProblem(counts(4), "title", 3)).toBeNull();
  });

  it("3 songs start a year game of 3, but title needs 4 different titles", () => {
    expect(canPickMode(counts(3), "year", 3)).toBe(true);
    expect(canPickMode(counts(3), "title", 3)).toBe(false);
    expect(modeProblem(counts(3), "title", 3)).toContain("needs 4 different titles");
  });

  it("without a length everything still works with 5 songs", () => {
    expect(matchLine(counts(3))).toBe("Only 3 songs match these filters – try 'Any' for genre or decade.");
    expect(modeFits(counts(5), "title")).toBe(true);
  });

  it("genre and decade tiles are greyed out by the chosen length, and the note says so", () => {
    const songCounts = [{ genre: "rock", decade: 1980, count: 7 }];
    expect(canChoose(songCounts, { genre: "rock" }, 5)).toBe(true);
    expect(canChoose(songCounts, { genre: "rock" }, 10)).toBe(false);
    expect(filterNotes(songCounts, { genre: "rock" }, 10)).toContain("Greyed-out decades have fewer than 10 Rock songs.");
  });
});
