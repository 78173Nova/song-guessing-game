// Which screen the solo game shows and what it remembers – as one plain function (a "reducer").
// The screen code (components/SoloGame.tsx) sends actions like "answer"; this decides what changes.
// No browser, no network: easy to test.
//
// Flow: start → creating → first-clip (loading the first song) → get-ready (3-2-1) → starting →
// round → reveal → starting the next round (or clip-loading if its clip is not ready yet) → ... → results.
import { MUSIC_LOAD_MESSAGE } from "./clip-loader";

export type RoundInfo = {
  round: number;
  totalRounds: number;
  previewUrl: string;
  options: string[];
};

export type AnswerResult = {
  correct: boolean;
  points: number;
  totalScore: number;
  correctOption: number;
  song: { title: string; artist: string; artworkUrl: string | null; storeUrl: string | null };
};

export type Answer = number | "skip" | "timeout";

export type PlayedRound = {
  round: number;
  title: string;
  artist: string;
  points: number;
  outcome: "correct" | "wrong" | "skipped" | "timeout";
};

type Progress = { score: number; history: PlayedRound[] };

// The clips of the game: one address per round, and whether it is loaded (or given up on).
type Clips = { gameId: string; previewUrls: string[]; ready: boolean[] };

type InGame = Clips & Progress;

export type GameState =
  | { screen: "start" }
  | { screen: "creating" }
  | ({ screen: "first-clip" } & InGame)
  | ({ screen: "get-ready" } & InGame)
  | ({ screen: "starting"; roundNumber: number } & InGame)
  | ({ screen: "tap-to-start"; roundNumber: number } & InGame)
  | ({ screen: "clip-loading"; roundNumber: number } & InGame)
  | ({ screen: "round"; round: RoundInfo; pending: Answer | null } & InGame)
  | ({ screen: "reveal"; round: RoundInfo; chosen: Answer; result: AnswerResult } & InGame)
  | ({ screen: "results" } & Progress)
  | { screen: "error"; message: string };

export type GameAction =
  | { type: "start" }
  | { type: "game-created"; gameId: string; previewUrls: string[] }
  | { type: "clip-ready"; gameId: string; index: number }
  | { type: "clip-failed"; gameId: string; index: number }
  | { type: "clip-replaced"; gameId: string; index: number; url: string }
  | { type: "countdown-done" }
  | { type: "autoplay-blocked" }
  | { type: "tapped" }
  | { type: "round-loaded"; round: RoundInfo }
  | { type: "answer"; answer: Answer }
  | { type: "answer-result"; result: AnswerResult }
  | { type: "next" }
  | { type: "failed"; message: string }
  | { type: "reset" };

export const initialState: GameState = { screen: "start" };

function outcomeOf(answer: Answer, correct: boolean): PlayedRound["outcome"] {
  if (answer === "skip") return "skipped";
  if (answer === "timeout") return "timeout";
  return correct ? "correct" : "wrong";
}

function inGame(state: GameState): state is Extract<GameState, InGame> {
  return "ready" in state;
}

// The parts every in-game screen keeps.
function keep(state: Extract<GameState, InGame>): InGame {
  const { gameId, previewUrls, ready, score, history } = state;
  return { gameId, previewUrls, ready, score, history };
}

// A clip is ready (or given up on – its round will then be skipped when it comes).
function clipSettled(state: GameState, gameId: string, index: number, failed: boolean): GameState {
  if (!inGame(state) || state.gameId !== gameId) return state;
  if (failed && index === 0 && state.screen === "first-clip") {
    return { screen: "error", message: MUSIC_LOAD_MESSAGE };
  }
  const ready = state.ready.map((r, i) => (i === index ? true : r));
  const updated = { ...state, ready };
  if (state.screen === "first-clip" && index === 0) return { ...keep(updated), screen: "get-ready" };
  if (state.screen === "clip-loading" && index === state.roundNumber - 1) {
    return { ...keep(updated), screen: "starting", roundNumber: state.roundNumber };
  }
  return updated;
}

// Actions that do not fit the current screen (a double click, a late reply) change nothing.
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start":
      return { screen: "creating" };

    case "game-created":
      if (state.screen !== "creating") return state;
      return {
        screen: "first-clip",
        gameId: action.gameId,
        previewUrls: action.previewUrls,
        ready: action.previewUrls.map(() => false),
        score: 0,
        history: [],
      };

    case "clip-ready":
      return clipSettled(state, action.gameId, action.index, false);

    case "clip-failed":
      return clipSettled(state, action.gameId, action.index, true);

    case "clip-replaced": {
      if (!inGame(state) || state.gameId !== action.gameId) return state;
      return {
        ...state,
        previewUrls: state.previewUrls.map((u, i) => (i === action.index ? action.url : u)),
        ready: state.ready.map((r, i) => (i === action.index ? false : r)),
      };
    }

    case "countdown-done":
      if (state.screen !== "get-ready") return state;
      return { ...keep(state), screen: "starting", roundNumber: 1 };

    case "autoplay-blocked":
      if (state.screen !== "starting") return state;
      return { ...keep(state), screen: "tap-to-start", roundNumber: state.roundNumber };

    case "tapped":
      if (state.screen !== "tap-to-start") return state;
      return { ...keep(state), screen: "starting", roundNumber: state.roundNumber };

    case "round-loaded":
      if (state.screen !== "starting" || action.round.round !== state.roundNumber) return state;
      return { ...keep(state), screen: "round", round: action.round, pending: null };

    case "answer":
      if (state.screen !== "round" || state.pending !== null) return state;
      return { ...state, pending: action.answer };

    case "answer-result": {
      if (state.screen !== "round" || state.pending === null) return state;
      const { result } = action;
      return {
        ...keep(state),
        screen: "reveal",
        round: state.round,
        chosen: state.pending,
        result,
        score: result.totalScore,
        history: [
          ...state.history,
          {
            round: state.round.round,
            title: result.song.title,
            artist: result.song.artist,
            points: result.points,
            outcome: outcomeOf(state.pending, result.correct),
          },
        ],
      };
    }

    case "next": {
      if (state.screen !== "reveal") return state;
      const nextNumber = state.round.round + 1;
      if (nextNumber > state.round.totalRounds) {
        return { screen: "results", score: state.score, history: state.history };
      }
      const screen = state.ready[nextNumber - 1] ? "starting" : "clip-loading";
      return { ...keep(state), screen, roundNumber: nextNumber };
    }

    case "failed":
      return { screen: "error", message: action.message };

    case "reset":
      return initialState;
  }
}
