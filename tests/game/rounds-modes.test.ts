import { describe, expect, it } from "vitest";
import { buildReplacementRound, buildRounds, type NewRound, type SongForGame } from "@/lib/game/rounds";

// Game modes (spec 003): the rounds for artist, year and mixed mode. Title mode is tested in rounds.test.ts.
const NOW_YEAR = 2026;

const eightSongs: SongForGame[] = [
  { id: 1, title: "Bohemian Rhapsody", artist: "Queen", year: 1975 },
  { id: 2, title: "Don't Stop Me Now", artist: "queen", year: 1978 }, // same artist, other spelling
  { id: 3, title: "Respect", artist: "Aretha Franklin", year: 1967 },
  { id: 4, title: "Umbrella", artist: "Rihanna", year: 2007 },
  { id: 5, title: "Happy", artist: "Pharrell Williams", year: 2013 },
  { id: 6, title: "Wonderwall", artist: "Oasis", year: 1995 },
  { id: 7, title: "Levitating", artist: "Dua Lipa", year: 2020 },
  { id: 8, title: "Africa", artist: "Toto", year: 1982 },
];

function build(songs: SongForGame[], mode: "title" | "artist" | "year" | "mixed", random = Math.random): NewRound[] {
  const result = buildRounds(songs, random, { mode, currentYear: NOW_YEAR });
  if (!result.ok) throw new Error(`expected rounds, got ${result.reason}`);
  return result.rounds;
}

const songOf = (round: NewRound) => eightSongs.find((s) => s.id === round.songId)!;
const key = (text: string) => text.trim().toLowerCase();

describe("buildRounds – title mode (default)", () => {
  it("marks every round as a title question, with or without the mode given", () => {
    for (const round of build(eightSongs, "title")) expect(round.questionType).toBe("title");
    const result = buildRounds(eightSongs);
    expect(result.ok && result.rounds.every((r) => r.questionType === "title")).toBe(true);
  });
});

describe("buildRounds – artist mode", () => {
  it("shows 4 different artists with the correct one at correctOption", () => {
    for (let i = 0; i < 50; i++) {
      for (const round of build(eightSongs, "artist")) {
        expect(round.questionType).toBe("artist");
        expect(round.options).toHaveLength(4);
        expect(round.options[round.correctOption]).toBe(songOf(round).artist);
        // Never the same artist twice, ignoring upper/lower case ("Queen" and "queen").
        expect(new Set(round.options.map(key)).size).toBe(4);
        // The wrong ones are artists of other songs.
        for (const option of round.options.filter((_, j) => j !== round.correctOption)) {
          expect(eightSongs.some((s) => s.artist === option)).toBe(true);
          expect(key(option)).not.toBe(key(songOf(round).artist));
        }
      }
    }
  });

  it("refuses with fewer than 4 different artists, works with exactly 4", () => {
    const threeArtists = eightSongs.map((s, i) => ({ ...s, artist: ["A", "B", "c", "C"][i % 4] }));
    expect(buildRounds(threeArtists, Math.random, { mode: "artist", currentYear: NOW_YEAR })).toEqual({
      ok: false,
      reason: "not-enough-songs",
    });
    const fourArtists = eightSongs.map((s, i) => ({ ...s, artist: ["A", "B", "C", "D"][i % 4] }));
    expect(buildRounds(fourArtists, Math.random, { mode: "artist", currentYear: NOW_YEAR }).ok).toBe(true);
  });
});

describe("buildRounds – year mode", () => {
  it("shows the correct year plus 3 wrong years, as text, following the year rules", () => {
    for (let i = 0; i < 50; i++) {
      for (const round of build(eightSongs, "year")) {
        expect(round.questionType).toBe("year");
        expect(round.options).toHaveLength(4);
        const correct = songOf(round).year!;
        expect(round.options[round.correctOption]).toBe(String(correct));
        const years = round.options.map(Number);
        for (const year of years) {
          expect(Math.abs(year - correct)).toBeLessThanOrEqual(10);
          expect(year).toBeLessThanOrEqual(NOW_YEAR);
          expect(year).toBeGreaterThanOrEqual(1950);
        }
        expect(new Set(years).size).toBe(4);
      }
    }
  });

  it("works even when all songs share one year (wrong years are calculated, not taken from songs)", () => {
    const sameYear = eightSongs.map((s) => ({ ...s, year: 2000 }));
    for (const round of build(sameYear, "year")) {
      expect(round.options[round.correctOption]).toBe("2000");
    }
  });

  it("puts the correct year in every one of the 4 positions across many games", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 100; i++) for (const round of build(eightSongs, "year")) positions.add(round.correctOption);
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it("refuses with fewer than 5 songs", () => {
    expect(buildRounds(eightSongs.slice(0, 4), Math.random, { mode: "year", currentYear: NOW_YEAR })).toEqual({
      ok: false,
      reason: "not-enough-songs",
    });
    expect(buildRounds(eightSongs.slice(0, 5), Math.random, { mode: "year", currentYear: NOW_YEAR }).ok).toBe(true);
  });
});

describe("buildRounds – mixed mode", () => {
  it("picks the question type per round with the random function, and each type can appear", () => {
    const types = new Set<string>();
    for (let i = 0; i < 30; i++) {
      for (const round of build(eightSongs, "mixed")) {
        types.add(round.questionType!);
        const song = songOf(round);
        const expected = { title: song.title, artist: song.artist, year: String(song.year) }[round.questionType!];
        expect(round.options[round.correctOption]).toBe(expected);
      }
    }
    expect(types).toEqual(new Set(["title", "artist", "year"]));
  });

  it("gives the same question types again with the same random sequence", () => {
    const sequence = () => {
      let n = 0;
      return () => ((n++ * 0.37) % 1);
    };
    const first = build(eightSongs, "mixed", sequence()).map((r) => r.questionType);
    const second = build(eightSongs, "mixed", sequence()).map((r) => r.questionType);
    expect(first).toEqual(second);
  });

  it("refuses with fewer than 4 different titles or fewer than 4 different artists", () => {
    const threeArtists = eightSongs.map((s, i) => ({ ...s, artist: ["A", "B", "C"][i % 3] }));
    const threeTitles = eightSongs.map((s, i) => ({ ...s, title: ["A", "B", "C"][i % 3] }));
    for (const songs of [threeArtists, threeTitles]) {
      expect(buildRounds(songs, Math.random, { mode: "mixed", currentYear: NOW_YEAR })).toEqual({
        ok: false,
        reason: "not-enough-songs",
      });
    }
  });
});

describe("buildReplacementRound – keeps the question type", () => {
  it("builds the new round with the question type it is given", () => {
    for (const questionType of ["title", "artist", "year"] as const) {
      for (let i = 0; i < 20; i++) {
        const result = buildReplacementRound(eightSongs, [1, 2, 3, 4, 5], 3, Math.random, {
          questionType,
          currentYear: NOW_YEAR,
        });
        if (!result.ok) throw new Error("expected a round");
        const { round } = result;
        expect(round.questionType).toBe(questionType);
        expect(round.roundNumber).toBe(3);
        expect([6, 7, 8]).toContain(round.songId);
        const song = songOf(round);
        const expected = { title: song.title, artist: song.artist, year: String(song.year) }[questionType];
        expect(round.options[round.correctOption]).toBe(expected);
        expect(new Set(round.options.map(key)).size).toBe(4);
      }
    }
  });

  it("refuses an artist round when there are fewer than 4 different artists", () => {
    const threeArtists = eightSongs.map((s, i) => ({ ...s, artist: ["A", "B", "C"][i % 3] }));
    expect(
      buildReplacementRound(threeArtists, [1], 1, Math.random, { questionType: "artist", currentYear: NOW_YEAR }),
    ).toEqual({ ok: false, reason: "not-enough-songs" });
  });
});
