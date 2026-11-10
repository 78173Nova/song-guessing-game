import { describe, expect, it } from "vitest";
import { buildReplacementRound, buildRounds, OPTIONS_PER_ROUND, ROUNDS_PER_GAME } from "@/lib/game/rounds";

function songs(titles: string[]) {
  return titles.map((title, i) => ({ id: i + 1, title }));
}

const eightSongs = songs(["Africa", "Hey Jude", "Respect", "Umbrella", "Happy", "Wonderwall", "Levitating", "Hey Ya!"]);

function build(input: { id: number; title: string }[]) {
  const result = buildRounds(input);
  if (!result.ok) throw new Error(`expected rounds, got ${result.reason}`);
  return result.rounds;
}

describe("buildRounds", () => {
  it("builds 5 rounds numbered 1–5 with 5 different songs", () => {
    expect(ROUNDS_PER_GAME).toBe(5);
    const rounds = build(eightSongs);

    expect(rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5]);
    const songIds = rounds.map((r) => r.songId);
    expect(new Set(songIds).size).toBe(5);
    for (const id of songIds) expect(eightSongs.some((s) => s.id === id)).toBe(true);
  });

  it("gives each round 4 different titles with the correct one at correctOption", () => {
    for (const round of build(eightSongs)) {
      const song = eightSongs.find((s) => s.id === round.songId)!;
      expect(round.options).toHaveLength(OPTIONS_PER_ROUND);
      expect(new Set(round.options.map((o) => o.toLowerCase())).size).toBe(4);
      expect(round.options[round.correctOption]).toBe(song.title);
      // The 3 wrong options are titles of other songs.
      const wrong = round.options.filter((_, i) => i !== round.correctOption);
      for (const title of wrong) {
        expect(eightSongs.some((s) => s.title === title && s.id !== song.id)).toBe(true);
      }
    }
  });

  it("never uses a song with the same title as the correct one as a wrong option", () => {
    const withTwoHappys = songs(["Happy", "happy", "Africa", "Respect", "Umbrella", "Wonderwall"]);
    for (let i = 0; i < 50; i++) {
      for (const round of build(withTwoHappys)) {
        const correct = round.options[round.correctOption].toLowerCase();
        const wrong = round.options.filter((_, j) => j !== round.correctOption).map((o) => o.toLowerCase());
        expect(wrong).not.toContain(correct);
      }
    }
  });

  it("puts the correct answer in every one of the 4 positions across many games", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 100; i++) {
      for (const round of build(eightSongs)) positions.add(round.correctOption);
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it("refuses with fewer than 5 songs, works with exactly 5, refuses with too few different titles", () => {
    expect(buildRounds(songs(["A", "B", "C", "D"]))).toEqual({ ok: false, reason: "not-enough-songs" });
    expect(buildRounds(songs(["A", "B", "C", "D", "E"])).ok).toBe(true);
    expect(buildRounds(songs(["A", "a", "B", "B", "C"]))).toEqual({ ok: false, reason: "not-enough-songs" });
  });
});

describe("buildReplacementRound", () => {
  it("picks a song that is not in the game, with 4 different titles and the correct one at correctOption", () => {
    const inGame = [1, 2, 3, 4, 5];
    for (let i = 0; i < 50; i++) {
      const result = buildReplacementRound(eightSongs, inGame, 3);
      if (!result.ok) throw new Error("expected a round");
      const { round } = result;
      expect(inGame).not.toContain(round.songId);
      expect(round.roundNumber).toBe(3);
      expect(new Set(round.options.map((o) => o.toLowerCase())).size).toBe(4);
      expect(round.options[round.correctOption]).toBe(eightSongs.find((s) => s.id === round.songId)!.title);
    }
  });

  it("refuses when every song is already in the game, or there are too few different titles", () => {
    const five = songs(["A", "B", "C", "D", "E"]);
    expect(buildReplacementRound(five, [1, 2, 3, 4, 5], 1)).toEqual({ ok: false, reason: "not-enough-songs" });
    expect(buildReplacementRound(songs(["A", "a", "B", "C", "c", "B"]), [1], 1)).toEqual({ ok: false, reason: "not-enough-songs" });
  });
});
