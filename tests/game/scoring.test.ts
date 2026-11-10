import { describe, expect, it } from "vitest";
import { scoreAnswer } from "@/lib/game/scoring";

const START = new Date("2026-11-10T12:00:00.000Z");
const after = (seconds: number) => new Date(START.getTime() + seconds * 1000);

describe("scoreAnswer", () => {
  it("gives 150 for a correct answer at 0 seconds", () => {
    expect(scoreAnswer(true, START, after(0))).toBe(150);
  });

  it("gives 100 for a correct answer at exactly 15 seconds (edge)", () => {
    expect(scoreAnswer(true, START, after(15))).toBe(100);
  });

  it("falls linearly in between, rounded to whole points", () => {
    expect(scoreAnswer(true, START, after(7.5))).toBe(125);
    expect(scoreAnswer(true, START, after(3))).toBe(140);
    expect(scoreAnswer(true, START, after(1))).toBe(147); // 146.67 → 147
  });

  it("gives 0 for a correct answer after 15 seconds (timed out)", () => {
    expect(scoreAnswer(true, START, after(15.001))).toBe(0);
    expect(scoreAnswer(true, START, after(60))).toBe(0);
  });

  it("gives 0 for a wrong answer, however fast", () => {
    expect(scoreAnswer(false, START, after(0))).toBe(0);
    expect(scoreAnswer(false, START, after(5))).toBe(0);
  });

  it("treats an answer timed before the round started as 0 seconds, never more than 150", () => {
    expect(scoreAnswer(true, START, after(-2))).toBe(150);
  });
});
