// Which screen the solo game shows and what it remembers – as one plain function (a "reducer").
// The screen code (components/SoloGame.tsx) sends actions like "answer"; this decides what changes.
// No browser, no network: easy to test.

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

export type GameState =
  | { screen: "start" }
  | ({ screen: "loading"; gameId: string | null } & Progress)
  | ({ screen: "round"; gameId: string; round: RoundInfo; pending: Answer | null } & Progress)
  | ({ screen: "reveal"; gameId: string; round: RoundInfo; chosen: Answer; result: AnswerResult } & Progress)
  | ({ screen: "results" } & Progress)
  | { screen: "error"; message: string };

export type GameAction =
  | { type: "start" }
  | { type: "round-loaded"; gameId: string; round: RoundInfo }
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

// Actions that do not fit the current screen (a double click, a late reply) change nothing.
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start":
      return { screen: "loading", gameId: null, score: 0, history: [] };

    case "round-loaded":
      if (state.screen !== "loading") return state;
      return {
        screen: "round",
        gameId: action.gameId,
        round: action.round,
        score: state.score,
        history: state.history,
        pending: null,
      };

    case "answer":
      if (state.screen !== "round" || state.pending !== null) return state;
      return { ...state, pending: action.answer };

    case "answer-result": {
      if (state.screen !== "round" || state.pending === null) return state;
      const { result } = action;
      return {
        screen: "reveal",
        gameId: state.gameId,
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

    case "next":
      if (state.screen !== "reveal") return state;
      if (state.round.round >= state.round.totalRounds) {
        return { screen: "results", score: state.score, history: state.history };
      }
      return { screen: "loading", gameId: state.gameId, score: state.score, history: state.history };

    case "failed":
      return { screen: "error", message: action.message };

    case "reset":
      return initialState;
  }
}
