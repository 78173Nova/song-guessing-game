import { describe, expect, it } from "vitest";
import { gameReducer, initialState, type GameAction, type GameState } from "@/lib/client/game-state";

// The "not enough songs" message on the start screen (spec 003, step 5).
const MESSAGE = "Only 3 songs match these filters – try 'Any' for genre or decade.";

function run(...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, initialState);
}

describe("gameReducer – start refused because too few songs match", () => {
  it("goes back to the start screen and shows the message there", () => {
    expect(run({ type: "start" }, { type: "start-refused", message: MESSAGE })).toEqual({
      screen: "start",
      message: MESSAGE,
    });
  });

  it("starting again clears the message", () => {
    expect(run({ type: "start" }, { type: "start-refused", message: MESSAGE }, { type: "start" })).toEqual({
      screen: "creating",
    });
  });

  it("is ignored when no game is being created (a late reply changes nothing)", () => {
    expect(run({ type: "start-refused", message: MESSAGE })).toEqual({ screen: "start" });
    const created = run({ type: "start" }, { type: "game-created", gameId: "g", previewUrls: ["a", "b", "c", "d", "e"] });
    expect(gameReducer(created, { type: "start-refused", message: MESSAGE })).toBe(created);
  });
});
