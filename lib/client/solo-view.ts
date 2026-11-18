// What the solo game screens show for a state, as plain functions (no React, no browser): easy to test.
// components/SoloGame.tsx turns these into icons, words and styles.
import { ROUND_SECONDS } from "./countdown";
import type { Answer, GameState } from "./game-state";

// How one answer button looks: "chosen" = tapped, the server is checking it; "correct" = the right answer,
// shown after the round; "wrong" = the player's own wrong pick; "none" = plain.
export type OptionMark = "none" | "chosen" | "correct" | "wrong";

export function optionMark(state: GameState, index: number): OptionMark {
  if (state.screen === "round") return state.pending === index ? "chosen" : "none";
  if (state.screen !== "reveal") return "none";
  if (index === state.result.correctOption) return "correct";
  if (index === state.chosen) return "wrong";
  return "none";
}

// The verdict after a round, as a kind (for the icon and colour) and words (never colour alone).
export type Verdict = { kind: "right" | "wrong" | "timeout" | "skipped"; text: string };

export function verdictOf(chosen: Answer, correct: boolean): Verdict {
  if (chosen === "skip") {
    return { kind: "skipped", text: "The preview could not be played – this round was skipped (0 points)." };
  }
  if (chosen === "timeout") return { kind: "timeout", text: "Time's up!" };
  return correct ? { kind: "right", text: "Right!" } : { kind: "wrong", text: "Wrong" };
}

// How full the countdown bar is (1 = all 15 seconds left, 0 = none). null = no seconds shown (answer sent).
// The bar is drawn with transform: scaleX(fraction), so it never animates its width.
export function timeLeftFraction(secondsLeft: number | null): number {
  if (secondsLeft === null) return 0;
  return Math.min(1, Math.max(0, secondsLeft / ROUND_SECONDS));
}
