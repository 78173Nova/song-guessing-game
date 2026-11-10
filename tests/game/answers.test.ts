import { describe, expect, it } from "vitest";
import { checkAnswer, nextRoundNumber, parseAnswerInput, type RoundState } from "@/lib/game/answers";

const START = new Date("2026-11-10T12:00:00.000Z");
const after = (seconds: number) => new Date(START.getTime() + seconds * 1000);
const openRound: RoundState = { status: "open", startedAt: START, correctOption: 2 };

describe("checkAnswer", () => {
  it("accepts the correct option with speed-bonus points", () => {
    expect(checkAnswer(openRound, 2, after(3))).toEqual({
      ok: true,
      status: "answered",
      chosenOption: 2,
      correct: true,
      points: 140,
    });
  });

  it("marks a wrong option as not correct with 0 points", () => {
    expect(checkAnswer(openRound, 1, after(3))).toEqual({
      ok: true,
      status: "answered",
      chosenOption: 1,
      correct: false,
      points: 0,
    });
  });

  it("gives 0 points for a correct option after 15 seconds", () => {
    expect(checkAnswer(openRound, 2, after(16))).toMatchObject({ ok: true, correct: true, points: 0 });
  });

  it("closes the round on 'timeout' with 0 points", () => {
    expect(checkAnswer(openRound, "timeout", after(15))).toEqual({
      ok: true,
      status: "answered",
      chosenOption: null,
      correct: false,
      points: 0,
    });
  });

  it("marks the round skipped on 'skip' with 0 points", () => {
    expect(checkAnswer(openRound, "skip", after(2))).toEqual({
      ok: true,
      status: "skipped",
      chosenOption: null,
      correct: false,
      points: 0,
    });
  });

  it("rejects an answer for a round that was not sent yet", () => {
    const waiting: RoundState = { status: "waiting", startedAt: null, correctOption: 2 };
    expect(checkAnswer(waiting, 2, after(1))).toEqual({ ok: false, error: "round-not-sent" });
  });

  it("rejects an answer for a round that was already answered or skipped", () => {
    for (const status of ["answered", "skipped"] as const) {
      const done: RoundState = { status, startedAt: START, correctOption: 2 };
      expect(checkAnswer(done, 2, after(1)), status).toEqual({ ok: false, error: "already-answered" });
      expect(checkAnswer(done, "skip", after(1)), status).toEqual({ ok: false, error: "already-answered" });
    }
  });
});

describe("parseAnswerInput", () => {
  it("accepts a round number with option 0–3, 'skip' or 'timeout'", () => {
    expect(parseAnswerInput({ round: 1, answer: 0 })).toEqual({ ok: true, round: 1, answer: 0 });
    expect(parseAnswerInput({ round: 5, answer: 3 })).toEqual({ ok: true, round: 5, answer: 3 });
    expect(parseAnswerInput({ round: 2, answer: "skip" })).toEqual({ ok: true, round: 2, answer: "skip" });
    expect(parseAnswerInput({ round: 2, answer: "timeout" })).toEqual({ ok: true, round: 2, answer: "timeout" });
  });

  it("rejects a missing or invalid round number as malformed", () => {
    for (const round of [undefined, 1.5, "1", 0, -1, null]) {
      expect(parseAnswerInput({ round, answer: 0 }), String(round)).toEqual({ ok: false, error: "malformed" });
    }
  });

  it("rejects numbers that are not one of the four options", () => {
    for (const answer of [4, -1, 1.5]) {
      expect(parseAnswerInput({ round: 1, answer }), String(answer)).toEqual({ ok: false, error: "invalid-option" });
    }
  });

  it("rejects answers of the wrong type as malformed", () => {
    for (const answer of [undefined, "2", "hello", "x".repeat(10_000), null, true, [1]]) {
      expect(parseAnswerInput({ round: 1, answer }), String(answer).slice(0, 20)).toEqual({ ok: false, error: "malformed" });
    }
  });

  it("rejects a body that is not an object", () => {
    for (const body of [null, undefined, [1, 2], "round=1", 42]) {
      expect(parseAnswerInput(body), String(body)).toEqual({ ok: false, error: "malformed" });
    }
  });
});

describe("nextRoundNumber", () => {
  it("picks the first round that was not sent yet", () => {
    expect(
      nextRoundNumber([
        { roundNumber: 1, status: "answered" },
        { roundNumber: 2, status: "skipped" },
        { roundNumber: 3, status: "waiting" },
        { roundNumber: 4, status: "waiting" },
      ]),
    ).toEqual({ ok: true, roundNumber: 3 });
  });

  it("refuses while a round is still open", () => {
    expect(
      nextRoundNumber([
        { roundNumber: 1, status: "open" },
        { roundNumber: 2, status: "waiting" },
      ]),
    ).toEqual({ ok: false, error: "round-still-open" });
  });

  it("refuses when every round is done", () => {
    expect(
      nextRoundNumber([
        { roundNumber: 1, status: "answered" },
        { roundNumber: 2, status: "skipped" },
      ]),
    ).toEqual({ ok: false, error: "game-finished" });
  });
});
