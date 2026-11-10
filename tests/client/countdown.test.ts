import { describe, expect, it } from "vitest";
import { secondsLeft } from "@/lib/client/countdown";

describe("secondsLeft", () => {
  it("counts down from 15 to 0 and stays within 0–15", () => {
    expect(secondsLeft(0)).toBe(15);
    expect(secondsLeft(14_200)).toBe(1);
    expect(secondsLeft(15_000)).toBe(0);
    expect(secondsLeft(40_000)).toBe(0);
    expect(secondsLeft(-3_000)).toBe(15);
  });
});
