import { describe, expect, it } from "vitest";
import { scoreMemory } from "@/lib/client/room-duel";

// The duel layout shows only while a round is open, so both scores change while it is hidden (issue #66). The
// memory keeps the score the viewer last saw, so each score rolls from there to the new one when the next round's
// duel appears.
describe("scoreMemory", () => {
  it("starts a score the viewer has not seen yet at its own value (no roll)", () => {
    expect(scoreMemory().startOf("Ana", 1200)).toBe(1200);
  });

  it("starts a score at the value the viewer saw last", () => {
    const memory = scoreMemory();
    memory.remember("Ana", 800);
    expect(memory.startOf("Ana", 1650)).toBe(800);
  });

  it("keeps each nickname apart", () => {
    const memory = scoreMemory();
    memory.remember("Ana", 800);
    memory.remember("Ben", 300);
    expect(memory.startOf("Ben", 900)).toBe(300);
    expect(memory.startOf("Cleo", 50)).toBe(50);
  });

  it("does not roll down when a score is lower than last seen (a new game started)", () => {
    const memory = scoreMemory();
    memory.remember("Ana", 4200);
    expect(memory.startOf("Ana", 0)).toBe(0);
  });

  it("does not roll when the score has not changed (no points last round)", () => {
    const memory = scoreMemory();
    memory.remember("Ana", 800);
    expect(memory.startOf("Ana", 800)).toBe(800);
  });
});
