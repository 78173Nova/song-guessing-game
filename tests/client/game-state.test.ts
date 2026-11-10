import { describe, expect, it } from "vitest";
import { MUSIC_LOAD_MESSAGE } from "@/lib/client/clip-loader";
import {
  gameReducer,
  initialState,
  type AnswerResult,
  type GameAction,
  type GameState,
  type RoundInfo,
} from "@/lib/client/game-state";

const GAME = "3f2b8c1e-9a4d-4e7b-b1c2-8d5e6f7a9b0c";
const URLS = [1, 2, 3, 4, 5].map((n) => `https://audio.example.com/${n}.m4a`);

function round(n: number): RoundInfo {
  return { round: n, totalRounds: 5, previewUrl: URLS[n - 1], options: ["A", "B", "C", "D"] };
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

const run = (...actions: GameAction[]): GameState => actions.reduce(gameReducer, initialState);
const from = (state: GameState, ...actions: GameAction[]): GameState => actions.reduce(gameReducer, state);

const created: GameAction = { type: "game-created", gameId: GAME, previewUrls: URLS };
const ready = (index: number): GameAction => ({ type: "clip-ready", gameId: GAME, index });

// The state right after round 1 has arrived.
const inRound1 = (): GameState =>
  run({ type: "start" }, created, ready(0), { type: "countdown-done" }, { type: "round-loaded", round: round(1) });

// Answers the current round and shows the reveal.
const answerAndReveal = (state: GameState, n: number, answer: 0 | 2 | "skip" | "timeout" = 2, res = result(n)): GameState =>
  from(state, { type: "answer", answer }, { type: "answer-result", result: res });

describe("gameReducer – getting ready", () => {
  it("start → creating → loading the first song → get ready only once the first clip is ready", () => {
    expect(initialState).toEqual({ screen: "start" });
    expect(run({ type: "start" })).toEqual({ screen: "creating" });

    const loading = run({ type: "start" }, created);
    expect(loading).toMatchObject({ screen: "first-clip", gameId: GAME, previewUrls: URLS, ready: [false, false, false, false, false] });

    // A later clip being ready does not start the countdown.
    expect(from(loading, ready(3)).screen).toBe("first-clip");
    expect(from(loading, ready(0))).toMatchObject({ screen: "get-ready", ready: [true, false, false, false, false] });
  });

  it("after the countdown: round 1 starting → the round screen when the round arrives, score 0", () => {
    const starting = run({ type: "start" }, created, ready(0), { type: "countdown-done" });
    expect(starting).toMatchObject({ screen: "starting", roundNumber: 1 });

    expect(from(starting, { type: "round-loaded", round: round(1) })).toMatchObject({
      screen: "round",
      round: round(1),
      score: 0,
      history: [],
      pending: null,
    });
  });

  it("the first clip failing for good → the error screen with the music message", () => {
    expect(run({ type: "start" }, created, { type: "clip-failed", gameId: GAME, index: 0 })).toEqual({
      screen: "error",
      message: MUSIC_LOAD_MESSAGE,
    });
  });

  it("a swapped clip replaces the address and must load again", () => {
    const state = run({ type: "start" }, created, { type: "clip-replaced", gameId: GAME, index: 0, url: "https://new.example.com/x.m4a" });
    expect(state).toMatchObject({ screen: "first-clip", previewUrls: ["https://new.example.com/x.m4a", ...URLS.slice(1)] });
    expect(from(state, ready(0)).screen).toBe("get-ready");
  });
});

describe("gameReducer – between rounds", () => {
  it("'Next' with the next clip ready goes straight to starting the next round, no countdown", () => {
    const reveal = answerAndReveal(from(inRound1(), ready(1)), 1);
    expect(from(reveal, { type: "next" })).toMatchObject({ screen: "starting", roundNumber: 2 });
  });

  it("'Next' with the next clip not ready waits on 'loading next song', then starts when it is ready", () => {
    const waiting = from(answerAndReveal(inRound1(), 1), { type: "next" });
    expect(waiting).toMatchObject({ screen: "clip-loading", roundNumber: 2 });

    expect(from(waiting, ready(2)).screen).toBe("clip-loading"); // a different clip
    expect(from(waiting, ready(1))).toMatchObject({ screen: "starting", roundNumber: 2 });
    // A later clip that failed for good does not block the game: its round starts (and will be skipped).
    expect(from(waiting, { type: "clip-failed", gameId: GAME, index: 1 })).toMatchObject({ screen: "starting", roundNumber: 2 });
  });

  it("blocked autoplay → 'tap to start' → tap → starting", () => {
    const blocked = run({ type: "start" }, created, ready(0), { type: "countdown-done" }, { type: "autoplay-blocked" });
    expect(blocked).toMatchObject({ screen: "tap-to-start", roundNumber: 1 });
    expect(from(blocked, { type: "tapped" })).toMatchObject({ screen: "starting", roundNumber: 1 });
  });
});

describe("gameReducer – answering", () => {
  it("locks the buttons while an answer is on its way and ignores a second click", () => {
    const answering = from(inRound1(), { type: "answer", answer: 2 });
    expect(answering).toMatchObject({ screen: "round", pending: 2 });
    expect(gameReducer(answering, { type: "answer", answer: 0 })).toBe(answering);
  });

  it("shows the reveal, takes the server's total score and records each outcome", () => {
    const reveal = answerAndReveal(inRound1(), 1);
    expect(reveal).toMatchObject({
      screen: "reveal",
      chosen: 2,
      result: result(1),
      score: 140,
      history: [{ round: 1, title: "Song 1", artist: "Artist 1", points: 140, outcome: "correct" }],
    });

    const zero = result(1, { correct: false, points: 0, totalScore: 0 });
    const outcome = (answer: 0 | "skip" | "timeout") => {
      const state = answerAndReveal(inRound1(), 1, answer, zero);
      return state.screen === "reveal" ? state.history[0].outcome : null;
    };
    expect(outcome(0)).toBe("wrong");
    expect(outcome("skip")).toBe("skipped");
    expect(outcome("timeout")).toBe("timeout");
  });

  it("after round 5 shows the results with all 5 songs; an error shows its message; 'Try again' resets", () => {
    let state = run({ type: "start" }, created, ready(0), ready(1), ready(2), ready(3), ready(4), { type: "countdown-done" });
    for (let n = 1; n <= 5; n++) {
      state = from(state, { type: "round-loaded", round: round(n) });
      state = answerAndReveal(state, n);
      state = from(state, { type: "next" });
    }
    expect(state).toMatchObject({ screen: "results", score: 700 });
    if (state.screen === "results") {
      expect(state.history.map((h) => h.title)).toEqual(["Song 1", "Song 2", "Song 3", "Song 4", "Song 5"]);
    }

    const error = from(inRound1(), { type: "failed", message: "Can't reach the server." });
    expect(error).toEqual({ screen: "error", message: "Can't reach the server." });
    expect(from(error, { type: "reset" })).toEqual({ screen: "start" });
  });

  it("ignores late results and clip events that no longer fit", () => {
    const fresh = inRound1();
    expect(gameReducer(fresh, { type: "answer-result", result: result(1) })).toBe(fresh); // nothing pending

    const start = run({ type: "start" }, { type: "reset" });
    expect(gameReducer(start, { type: "answer-result", result: result(1) })).toBe(start);
    expect(gameReducer(start, ready(0))).toBe(start);

    // A clip event from an earlier game.
    const loading = run({ type: "start" }, created);
    expect(gameReducer(loading, { type: "clip-ready", gameId: "00000000-0000-4000-8000-000000000000", index: 0 })).toBe(loading);

    // A round reply for a different round number.
    const starting = run({ type: "start" }, created, ready(0), { type: "countdown-done" });
    expect(gameReducer(starting, { type: "round-loaded", round: round(2) })).toBe(starting);
  });
});
