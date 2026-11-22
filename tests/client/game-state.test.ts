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

  it("keeps the song's iTunes link (storeUrl) in the history when the answer comes back", () => {
    const reveal = answerAndReveal(inRound1(), 1);
    expect(reveal.screen === "reveal" && reveal.history[0].storeUrl).toBe("https://music.example.com/s");
  });

  it("keeps a missing iTunes link as null, also for a wrong, skipped or timed-out answer", () => {
    const noLink = (n: number) => result(n, { correct: false, points: 0, totalScore: 0, song: { ...result(n).song, storeUrl: null } });
    for (const answer of [0, "skip", "timeout"] as const) {
      const state = answerAndReveal(inRound1(), 1, answer, noLink(1));
      expect(state.screen === "reveal" && state.history[0]).toMatchObject({ points: 0, storeUrl: null });
    }
  });

  it("the results keep each round's own iTunes link, in round order, with or without one", () => {
    const link = (n: number) => (n === 3 ? null : `https://music.example.com/song-${n}`);
    let state = run({ type: "start" }, created, ready(0), ready(1), ready(2), ready(3), ready(4), { type: "countdown-done" });
    for (let n = 1; n <= 5; n++) {
      state = from(state, { type: "round-loaded", round: round(n) });
      state = answerAndReveal(state, n, 2, result(n, { song: { ...result(n).song, storeUrl: link(n) } }));
      state = from(state, { type: "next" });
    }
    expect(state.screen).toBe("results");
    if (state.screen === "results") {
      expect(state.history.map((h) => h.storeUrl)).toEqual([
        "https://music.example.com/song-1",
        "https://music.example.com/song-2",
        null,
        "https://music.example.com/song-4",
        "https://music.example.com/song-5",
      ]);
    }
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

// "Leave game" (team feedback 22 Nov, point 2): the button under the answers. After the player confirms, the page
// sends "reset" – the same action as "Change settings" – and is back on the start screen with the settings kept.
describe("gameReducer – leaving a game", () => {
  const OTHER_GAME = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
  const inReveal = () => answerAndReveal(inRound1(), 1);

  // Every screen of a running game, from "Loading first song…" to the reveal.
  const runningScreens: [string, () => GameState][] = [
    ["creating the game", () => run({ type: "start" })],
    ["loading the first song", () => run({ type: "start" }, created)],
    ["the 3-2-1", () => run({ type: "start" }, created, ready(0))],
    ["starting round 1", () => run({ type: "start" }, created, ready(0), { type: "countdown-done" })],
    ["tap to start", () => run({ type: "start" }, created, ready(0), { type: "countdown-done" }, { type: "autoplay-blocked" })],
    ["loading the next song", () => from(inReveal(), { type: "next" })],
    ["a round", inRound1],
    ["a round with an answer on its way", () => from(inRound1(), { type: "answer", answer: 2 })],
    ["the reveal", inReveal],
  ];

  it.each(runningScreens)("goes back to the start screen from %s", (_label, state) => {
    expect(from(state(), { type: "reset" })).toEqual({ screen: "start" });
  });

  it("ignores every late reply of the left game: the start screen stays", () => {
    const left = from(inRound1(), { type: "answer", answer: 2 }, { type: "reset" });
    const late: GameAction[] = [
      created,
      ready(1),
      { type: "clip-failed", gameId: GAME, index: 0 },
      { type: "clip-replaced", gameId: GAME, index: 2, url: "https://new.example.com/x.m4a" },
      { type: "countdown-done" },
      { type: "autoplay-blocked" },
      { type: "round-loaded", round: round(2) },
      { type: "answer-result", result: result(1) },
      { type: "start-refused", message: "Too few songs." },
    ];
    for (const action of late) expect(gameReducer(left, action)).toBe(left);
  });

  it("ignores a late error of the left game: no 'The game stopped' on the start screen", () => {
    const left = from(inRound1(), { type: "reset" });
    expect(gameReducer(left, { type: "failed", gameId: GAME, message: "Can't reach the server." })).toBe(left);
  });

  it("still shows an error of the running game, and an error before any game (e.g. an unsupported browser)", () => {
    expect(from(inRound1(), { type: "failed", gameId: GAME, message: "Can't reach the server." })).toEqual({
      screen: "error",
      message: "Can't reach the server.",
    });
    expect(run({ type: "failed", message: "This browser cannot play the clips." })).toEqual({
      screen: "error",
      message: "This browser cannot play the clips.",
    });
  });

  it("starts the next game cleanly: score 0, no history, every clip loading again", () => {
    const left = from(inReveal(), { type: "reset" });
    const next = from(left, { type: "start" }, { type: "game-created", gameId: OTHER_GAME, previewUrls: URLS });
    expect(next).toEqual({
      screen: "first-clip",
      gameId: OTHER_GAME,
      previewUrls: URLS,
      ready: [false, false, false, false, false],
      score: 0,
      history: [],
    });
  });

  it("does not let replies of the left game reach the next game", () => {
    const next = from(
      inRound1(),
      { type: "reset" },
      { type: "start" },
      { type: "game-created", gameId: OTHER_GAME, previewUrls: URLS },
    );
    expect(gameReducer(next, ready(0))).toBe(next); // the old game's first clip
    expect(gameReducer(next, { type: "clip-failed", gameId: GAME, index: 0 })).toBe(next);
    expect(gameReducer(next, { type: "failed", gameId: GAME, message: "Can't reach the server." })).toBe(next);
  });
});
