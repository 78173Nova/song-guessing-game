import { describe, expect, it } from "vitest";
import {
  isMode,
  MODES,
  parseStartInput,
  QUESTION_LABELS,
  QUESTION_TYPES,
  wrongYears,
} from "@/lib/game/modes";

// A random function that always returns the same sequence, so a test can be repeated exactly.
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("modes and question types", () => {
  it("has exactly the 4 modes and 3 question types from spec 003", () => {
    expect(MODES).toEqual(["title", "artist", "year", "mixed"]);
    expect(QUESTION_TYPES).toEqual(["title", "artist", "year"]);
  });

  it("gives every question type the text the round screen shows", () => {
    expect(QUESTION_LABELS).toEqual({ title: "Which song?", artist: "Who sings this?", year: "Which year?" });
  });

  it("accepts only an exact mode from the list", () => {
    for (const mode of MODES) expect(isMode(mode)).toBe(true);
    for (const value of ["Title", " title", "song", "", null, undefined, 1, ["title"], { mode: "title" }]) {
      expect(isMode(value)).toBe(false);
    }
  });
});

describe("parseStartInput – the body of POST /api/games", () => {
  it("uses title mode when the body is missing or empty", () => {
    expect(parseStartInput(undefined)).toEqual({ ok: true, mode: "title" });
    expect(parseStartInput({})).toEqual({ ok: true, mode: "title" });
  });

  it("accepts each of the 4 modes", () => {
    for (const mode of MODES) expect(parseStartInput({ mode })).toEqual({ ok: true, mode });
  });

  it("rejects an unknown mode", () => {
    for (const mode of ["songs", "Title", "", "x".repeat(5000)]) {
      expect(parseStartInput({ mode })).toEqual({ ok: false, error: "invalid-mode" });
    }
  });

  it("rejects wrong types and unknown extra fields", () => {
    for (const body of [null, "title", 42, ["title"], { mode: 1 }, { mode: ["title"] }, { mode: null }, { mode: "title", extra: 1 }]) {
      expect(parseStartInput(body), JSON.stringify(body)).toEqual({ ok: false, error: "malformed" });
    }
  });
});

describe("wrongYears – the 3 wrong options in year mode", () => {
  // All rules from spec 003 for one correct year and its wrong years.
  function expectValid(correct: number, wrong: number[], currentYear: number) {
    expect(wrong).toHaveLength(3);
    const all = [correct, ...wrong];
    for (const year of wrong) {
      expect(Number.isInteger(year)).toBe(true);
      expect(Math.abs(year - correct)).toBeLessThanOrEqual(10);
      expect(year).toBeLessThanOrEqual(currentYear);
      expect(year).toBeGreaterThanOrEqual(1950);
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(Math.abs(all[i] - all[j]), `${all}`).toBeGreaterThanOrEqual(2);
      }
    }
  }

  it("follows every rule for many correct years and random sequences", () => {
    for (let correct = 1957; correct <= 2026; correct++) {
      for (let seed = 1; seed <= 20; seed++) {
        expectValid(correct, wrongYears(correct, 2026, seeded(seed * 1000 + correct))!, 2026);
      }
    }
  });

  it("never goes past the current year (correct year = current year)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const wrong = wrongYears(2026, 2026, seeded(seed))!;
      expectValid(2026, wrong, 2026);
      for (const year of wrong) expect(year).toBeLessThanOrEqual(2024);
    }
  });

  it("never goes before 1950 (correct year near 1950)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      expectValid(1950, wrongYears(1950, 2026, seeded(seed))!, 2026);
      expectValid(1957, wrongYears(1957, 2026, seeded(seed))!, 2026);
    }
  });

  it("uses years both before and after the correct one across many games", () => {
    const sides = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      for (const year of wrongYears(1987, 2026, seeded(seed))!) sides.add(year < 1987 ? "before" : "after");
    }
    expect(sides).toEqual(new Set(["before", "after"]));
  });

  it("gives up (null) when the rules cannot be met, e.g. a year after the current year", () => {
    expect(wrongYears(2040, 2026, Math.random)).toBeNull();
  });
});
