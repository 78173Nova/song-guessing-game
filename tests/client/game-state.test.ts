import { describe, expect, it } from "vitest";
import {
  gameReducer,
  initialState,
  type AnswerResult,
  type GameState,
  type RoundInfo,
} from "@/lib/client/game-state";

const GAME = "3f2b8c1e-9a4d-4e7b-b1c2-8d5e6f7a9b0c";

function round(n: number): RoundInfo {
  return { round: n, totalRounds: 5, previewUrl: `https://audio.example.com/${n}.m4a`, options: ["A", "B", "C", "D"] };
}

function result(n: number, overrides: Partial<AnswerResult> = {}): AnswerResult {
  return {
    correct: true,
    points: 140,
    totalScore: 140 * n,
    correctOption: 2,
    song: { title: `Song ${n}`, artist: `Artist ${n}`, artworkUrl: "https://art.example.com/a.jpg", storeUrl: "https://music.example.com/s" },
    ...overrides,
  };
}

// Runs a list of actions from the start screen.
function run(...actions: Parameters<typeof gameReducer>[1][]): GameState {
  return actions.reduce(gameReducer, initialState);
}

describe("gameReducer", () => {
  it("goes from start to loading to the first round with score 0", () => {
    expect(initialState).toEqual({ screen: "start" });
    const loading = run({ type: "start" });
    expect(loading).toMatchObject({ screen: "loading", score: 0, history: [] });

    const state = gameReducer(loading, { type: "round-loaded", gameId: GAME, round: round(1) });
    expect(state).toEqual({ screen: "round", gameId: GAME, round: round(1), score: 0, history: [], pending: null });
  });

  it("locks the buttons while an answer is on its way and ignores a second click", () => {
    const answering = run({ type: "start" }, { type: "round-loaded", gameId: GAME, round: round(1) }, { type: "answer", answer: 2 });
    expect(answering).toMatchObject({ screen: "round", pending: 2 });

    expect(gameReducer(answering, { type: "answer", answer: 0 })).toBe(answering);
  });

  it("shows the reveal with the result, takes the server's total score and records the round", () => {
    const state = run(
      { type: "start" },
      { type: "round-loaded", gameId: GAME, round: round(1) },
      { type: "answer", answer: 2 },
      { type: "answer-result", result: result(1) },
    );

    expect(state).toEqual({
      screen: "reveal",
      gameId: GAME,
      round: round(1),
      chosen: 2,
      result: result(1),
      score: 140,
      history: [{ round: 1, title: "Song 1", artist: "Artist 1", points: 140, outcome: "correct" }],
    });
  });

  it("records wrong, skipped and timed-out rounds with their own outcome", () => {
    const outcomeOf = (answer: 0 | "skip" | "timeout", correct: boolean) => {
      const state = run(
        { type: "start" },
        { type: "round-loaded", gameId: GAME, round: round(1) },
        { type: "answer", answer },
        { type: "answer-result", result: result(1, { correct, points: 0, totalScore: 0 }) },
      );
      return state.screen === "reveal" ? state.history[0].outcome : null;
    };
    expect(outcomeOf(0, false)).toBe("wrong");
    expect(outcomeOf("skip", false)).toBe("skipped");
    expect(outcomeOf("timeout", false)).toBe("timeout");
  });

  it("'next' loads the next round, and after round 5 shows the results with all 5 songs", () => {
    let state: GameState = run({ type: "start" });
    for (let n = 1; n <= 5; n++) {
      state = gameReducer(state, { type: "round-loaded", gameId: GAME, round: round(n) });
      state = gameReducer(state, { type: "answer", answer: 2 });
      state = gameReducer(state, { type: "answer-result", result: result(n) });
      state = gameReducer(state, { type: "next" });
      if (n < 5) expect(state).toMatchObject({ screen: "loading", gameId: GAME, score: 140 * n });
    }

    expect(state.screen).toBe("results");
    if (state.screen !== "results") return;
    expect(state.score).toBe(700);
    expect(state.history.map((h) => h.title)).toEqual(["Song 1", "Song 2", "Song 3", "Song 4", "Song 5"]);
  });

  it("shows an error with its message, and 'reset' goes back to the start", () => {
    const error = run({ type: "start" }, { type: "failed", message: "The music source is not reachable right now." });
    expect(error).toEqual({ screen: "error", message: "The music source is not reachable right now." });
    expect(gameReducer(error, { type: "reset" })).toEqual({ screen: "start" });
  });

  it("ignores an answer result when no answer is pending", () => {
    const fresh = run({ type: "start" }, { type: "round-loaded", gameId: GAME, round: round(1) });
    expect(gameReducer(fresh, { type: "answer-result", result: result(1) })).toBe(fresh);

    const start = run({ type: "start" }, { type: "reset" });
    expect(gameReducer(start, { type: "answer-result", result: result(1) })).toBe(start);
  });
});
