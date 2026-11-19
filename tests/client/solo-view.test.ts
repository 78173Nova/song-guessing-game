import { describe, expect, it } from "vitest";
import type { AnswerResult, GameState, RoundInfo } from "@/lib/client/game-state";
import { optionMark, timeLeftFraction, verdictOf } from "@/lib/client/solo-view";

const round: RoundInfo = {
  round: 2,
  totalRounds: 5,
  previewUrl: "https://example.test/clip.m4a",
  options: ["A", "B", "C", "D"],
  questionType: "title",
};
const clips = { gameId: "g1", previewUrls: [], ready: [], score: 0, history: [] };
const result = (correct: boolean, correctOption: number): AnswerResult => ({
  correct,
  correctOption,
  points: correct ? 800 : 0,
  totalScore: correct ? 800 : 0,
  song: { title: "Song", artist: "Artist", artworkUrl: null, storeUrl: null },
});

describe("optionMark", () => {
  it("marks nothing while the round is open and no answer was tapped", () => {
    const state: GameState = { screen: "round", round, pending: null, ...clips };
    expect([0, 1, 2, 3].map((i) => optionMark(state, i))).toEqual(["none", "none", "none", "none"]);
  });

  it("marks the tapped answer as chosen while the server checks it", () => {
    const state: GameState = { screen: "round", round, pending: 2, ...clips };
    expect([0, 1, 2, 3].map((i) => optionMark(state, i))).toEqual(["none", "none", "chosen", "none"]);
  });

  it("marks nothing as chosen when the round closed by timeout", () => {
    const state: GameState = { screen: "round", round, pending: "timeout", ...clips };
    expect([0, 1, 2, 3].map((i) => optionMark(state, i))).toEqual(["none", "none", "none", "none"]);
  });

  it("after a right answer, marks only the right answer", () => {
    const state: GameState = { screen: "reveal", round, chosen: 1, result: result(true, 1), ...clips };
    expect([0, 1, 2, 3].map((i) => optionMark(state, i))).toEqual(["none", "correct", "none", "none"]);
  });

  it("after a wrong answer, marks the right answer and the player's wrong pick", () => {
    const state: GameState = { screen: "reveal", round, chosen: 3, result: result(false, 0), ...clips };
    expect([0, 1, 2, 3].map((i) => optionMark(state, i))).toEqual(["correct", "none", "none", "wrong"]);
  });

  it("after a timeout, marks only the right answer", () => {
    const state: GameState = { screen: "reveal", round, chosen: "timeout", result: result(false, 2), ...clips };
    expect([0, 1, 2, 3].map((i) => optionMark(state, i))).toEqual(["none", "none", "correct", "none"]);
  });

  it("marks nothing on other screens", () => {
    expect(optionMark({ screen: "start" }, 0)).toBe("none");
  });
});

describe("verdictOf", () => {
  it("says Right for a right answer", () => {
    expect(verdictOf(1, true)).toEqual({ kind: "right", text: "Right!" });
  });

  it("says Wrong for a wrong answer", () => {
    expect(verdictOf(3, false)).toEqual({ kind: "wrong", text: "Wrong" });
  });

  it("says the time ran out, even though that also scores nothing", () => {
    expect(verdictOf("timeout", false)).toEqual({ kind: "timeout", text: "Time's up!" });
  });

  it("explains a skipped round in words, with its 0 points", () => {
    expect(verdictOf("skip", false)).toEqual({
      kind: "skipped",
      text: "The preview could not be played – this round was skipped (0 points).",
    });
  });
});

describe("timeLeftFraction", () => {
  it("is full at 15 seconds, half at 7.5, empty at 0", () => {
    expect(timeLeftFraction(15)).toBe(1);
    expect(timeLeftFraction(7.5)).toBe(0.5);
    expect(timeLeftFraction(0)).toBe(0);
  });

  it("stays between 0 and 1 for values out of range", () => {
    expect(timeLeftFraction(20)).toBe(1);
    expect(timeLeftFraction(-2)).toBe(0);
  });

  it("is empty while the answer is being checked (no seconds shown)", () => {
    expect(timeLeftFraction(null)).toBe(0);
  });
});
