import { describe, expect, it } from "vitest";
import { gameReducer, initialState, type AnswerResult, type GameAction, type GameState } from "@/lib/client/game-state";

// A solo game of 2 sets of 3 songs.
const GAME = "3f2b8c1e-9a4d-4e7b-b1c2-8d5e6f7a9b0c";
const URLS = [1, 2, 3, 4, 5, 6].map((n) => `https://audio.example.com/${n}.m4a`);
const from = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);

const result = (n: number): AnswerResult => ({
  correct: true,
  points: 100,
  totalScore: 100 * n,
  correctOption: 2,
  song: { title: `Song ${n}`, artist: `Artist ${n}`, artworkUrl: null, storeUrl: null },
});

const roundInfo = (n: number, totalRounds = 6) => ({ round: n, totalRounds, previewUrl: URLS[n - 1], options: ["A", "B", "C", "D"] });

const play = (state: GameState, n: number, answer: 2 | "skip" | "timeout" = 2, totalRounds = 6) =>
  from(state, { type: "round-loaded", round: roundInfo(n, totalRounds) }, { type: "answer", answer }, { type: "answer-result", result: result(n) });

function started(songsPerSet = 3, urls = URLS): GameState {
  const ready = urls.map((_, index): GameAction => ({ type: "clip-ready", gameId: GAME, index }));
  return from(initialState, { type: "start" }, { type: "game-created", gameId: GAME, previewUrls: urls, songsPerSet }, ...ready, { type: "countdown-done" });
}

function atFirstSummary(): GameState {
  let state = started();
  for (const n of [1, 2, 3]) state = from(play(state, n), { type: "next" });
  return state;
}

describe("gameReducer – sets in a solo game", () => {
  it("a song in the middle of a set goes straight to the next song", () => {
    expect(from(play(started(), 1), { type: "next" })).toMatchObject({ screen: "starting", roundNumber: 2 });
  });

  it("the last song of a set leads to the set summary with only that set's songs", () => {
    const state = atFirstSummary();
    expect(state).toMatchObject({ screen: "set-summary", setNumber: 1, totalSets: 2, nextRound: 4, score: 300 });
    if (state.screen !== "set-summary") throw new Error("expected the set summary");
    expect(state.setSongs.map((song) => song.title)).toEqual(["Song 1", "Song 2", "Song 3"]);
  });

  it("the second set's summary leaves out the first set; skipped and timed-out songs are in it", () => {
    const urls = [...URLS, 7, 8, 9].map(String);
    let state = started(3, urls);
    for (const n of [1, 2, 3]) state = from(play(state, n, 2, 9), { type: "next" });
    state = from(state, { type: "next-set" });
    state = from(play(state, 4, "skip", 9), { type: "next" });
    state = from(play(state, 5, "timeout", 9), { type: "next" });
    state = from(play(state, 6, 2, 9), { type: "next" });
    if (state.screen !== "set-summary") throw new Error("expected the set summary");
    expect(state.setNumber).toBe(2);
    expect(state.setSongs.map((song) => [song.round, song.outcome])).toEqual([
      [4, "skipped"],
      [5, "timeout"],
      [6, "correct"],
    ]);
  });

  it("Next set starts the next song", () => {
    expect(from(atFirstSummary(), { type: "next-set" })).toMatchObject({ screen: "starting", roundNumber: 4 });
  });

  it("Next set waits when the next clip has not loaded, and a clip loaded during the summary counts", () => {
    const urls = URLS;
    const onlyFirstThree = [0, 1, 2].map((index): GameAction => ({ type: "clip-ready", gameId: GAME, index }));
    let state = from(initialState, { type: "start" }, { type: "game-created", gameId: GAME, previewUrls: urls, songsPerSet: 3 }, ...onlyFirstThree, { type: "countdown-done" });
    for (const n of [1, 2, 3]) state = from(play(state, n), { type: "next" });
    expect(from(state, { type: "next-set" })).toMatchObject({ screen: "clip-loading", roundNumber: 4 });

    const loaded = from(state, { type: "clip-ready", gameId: GAME, index: 3 });
    expect(loaded.screen).toBe("set-summary");
    expect(from(loaded, { type: "next-set" })).toMatchObject({ screen: "starting", roundNumber: 4 });
  });

  it("the last song of the last set goes straight to the results with every song", () => {
    let state = from(atFirstSummary(), { type: "next-set" });
    for (const n of [4, 5, 6]) state = from(play(state, n), { type: "next" });
    expect(state).toMatchObject({ screen: "results", score: 600 });
    if (state.screen !== "results") throw new Error("expected the results");
    expect(state.history).toHaveLength(6);
  });

  it("a game of one set has no set summary", () => {
    const urls = URLS.slice(0, 3);
    let state = started(3, urls);
    for (const n of [1, 2, 3]) state = from(play(state, n, 2, 3), { type: "next" });
    expect(state.screen).toBe("results");
  });

  it("a game created without a set length has no set summary", () => {
    const ready = URLS.map((_, index): GameAction => ({ type: "clip-ready", gameId: GAME, index }));
    let state = from(initialState, { type: "start" }, { type: "game-created", gameId: GAME, previewUrls: URLS }, ...ready, { type: "countdown-done" });
    for (const n of [1, 2, 3]) state = from(play(state, n), { type: "next" });
    expect(state).toMatchObject({ screen: "starting", roundNumber: 4 });
  });

  it("a double tap on Next set changes nothing the second time", () => {
    const once = from(atFirstSummary(), { type: "next-set" });
    expect(from(once, { type: "next-set" })).toEqual(once);
  });

  it("Next set on another screen, and a late answer or Next on the summary, change nothing", () => {
    const inRound = from(started(), { type: "round-loaded", round: roundInfo(1) });
    expect(from(inRound, { type: "next-set" })).toEqual(inRound);

    const summary = atFirstSummary();
    expect(from(summary, { type: "next" })).toEqual(summary);
    expect(from(summary, { type: "answer-result", result: result(3) })).toEqual(summary);
    expect(from(summary, { type: "round-loaded", round: roundInfo(4) })).toEqual(summary);
  });
});
