import { describe, expect, it } from "vitest";
import { GENRES, GENRE_LABELS, isGenre } from "@/lib/game/genres";

describe("lib/game/genres.ts – the fixed genre list", () => {
  it("has exactly the 6 genres from spec 003, in this order", () => {
    expect(GENRES).toEqual(["pop", "rock", "hip-hop", "r&b", "dance", "country"]);
  });

  it("has a readable name for every genre", () => {
    expect(GENRE_LABELS).toEqual({
      pop: "Pop",
      rock: "Rock",
      "hip-hop": "Hip-hop",
      "r&b": "R&B / Soul",
      dance: "Dance / Electronic",
      country: "Country / Folk",
    });
  });

  it("accepts every genre from the list", () => {
    for (const genre of GENRES) {
      expect(isGenre(genre), genre).toBe(true);
    }
  });

  it("rejects genres that are not on the list", () => {
    for (const value of ["soul", "disco", "jazz", "", " pop", "Pop", "POP", "r&b ", "hiphop"]) {
      expect(isGenre(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("rejects values that are not text", () => {
    for (const value of [undefined, null, 1, true, ["pop"], { genre: "pop" }]) {
      expect(isGenre(value), JSON.stringify(value)).toBe(false);
    }
  });
});
