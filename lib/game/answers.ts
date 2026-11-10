// Checking answers and validating what the browser sends. Plain functions: no database, no network.
import { OPTIONS_PER_ROUND } from "./rounds";
import { scoreAnswer } from "./scoring";

export type RoundStatus = "waiting" | "open" | "answered" | "skipped";

// What the player sends: the button (0–3), "skip" (preview failed to load) or "timeout" (time ran out).
export type Answer = number | "skip" | "timeout";

export type ParsedAnswer =
  | { ok: true; round: number; answer: Answer }
  | { ok: false; error: "malformed" | "invalid-option" };

// Checks the shape of the answer request body. The range of the round number is checked later,
// against the game's real number of rounds.
export function parseAnswerInput(body: unknown): ParsedAnswer {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "malformed" };
  }
  const { round, answer } = body as Record<string, unknown>;

  if (typeof round !== "number" || !Number.isInteger(round) || round < 1) {
    return { ok: false, error: "malformed" };
  }
  if (answer === "skip" || answer === "timeout") {
    return { ok: true, round, answer };
  }
  if (typeof answer !== "number") {
    return { ok: false, error: "malformed" };
  }
  if (!Number.isInteger(answer) || answer < 0 || answer >= OPTIONS_PER_ROUND) {
    return { ok: false, error: "invalid-option" };
  }
  return { ok: true, round, answer };
}

// Checks the body of a request that only names a round: { round: 1, 2, ... }.
export function parseRoundInput(body: unknown): { ok: true; round: number } | { ok: false; error: "malformed" } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "malformed" };
  const { round } = body as Record<string, unknown>;
  if (typeof round !== "number" || !Number.isInteger(round) || round < 1) return { ok: false, error: "malformed" };
  return { ok: true, round };
}

export type RoundState = {
  status: RoundStatus;
  startedAt: Date | null;
  correctOption: number;
};

export type CheckResult =
  | {
      ok: true;
      status: "answered" | "skipped";
      chosenOption: number | null;
      correct: boolean;
      points: number;
    }
  | { ok: false; error: "round-not-sent" | "already-answered" };

// Decides what an answer means for a round. Time is measured from when the server sent the round.
export function checkAnswer(round: RoundState, answer: Answer, now: Date): CheckResult {
  if (round.status === "answered" || round.status === "skipped") {
    return { ok: false, error: "already-answered" };
  }
  if (round.status === "waiting" || round.startedAt === null) {
    return { ok: false, error: "round-not-sent" };
  }
  if (answer === "skip") {
    return { ok: true, status: "skipped", chosenOption: null, correct: false, points: 0 };
  }
  if (answer === "timeout") {
    return { ok: true, status: "answered", chosenOption: null, correct: false, points: 0 };
  }
  const correct = answer === round.correctOption;
  return {
    ok: true,
    status: "answered",
    chosenOption: answer,
    correct,
    points: scoreAnswer(correct, round.startedAt, now),
  };
}

export type NextRound =
  | { ok: true; roundNumber: number }
  | { ok: false; error: "round-still-open" | "game-finished" };

// The next round to send: the first one not sent yet – but only once the current one is closed.
export function nextRoundNumber(rounds: { roundNumber: number; status: RoundStatus }[]): NextRound {
  if (rounds.some((r) => r.status === "open")) return { ok: false, error: "round-still-open" };
  const next = rounds.find((r) => r.status === "waiting");
  if (!next) return { ok: false, error: "game-finished" };
  return { ok: true, roundNumber: next.roundNumber };
}

// A game ID must look like a UUID before it goes anywhere near the database.
export function isValidGameId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
