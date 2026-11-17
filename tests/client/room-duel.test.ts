import { describe, expect, it } from "vitest";
import { duelSides, roomLayout } from "@/lib/client/room-duel";

// Which layout a room round uses (issue #39): the duel layout for a game with exactly two players – every Duel
// room, and a Multiplayer room whose game started with 2 players – otherwise the Multiplayer game board.
describe("roomLayout", () => {
  it("is the duel layout for a Duel room", () => {
    expect(roomLayout({ settings: { type: "duel" }, startingPlayers: 2 })).toBe("duel");
  });

  it("is the duel layout for a Duel room even if the start count is missing", () => {
    expect(roomLayout({ settings: { type: "duel" }, startingPlayers: null })).toBe("duel");
  });

  it("is the duel layout for a Multiplayer game that started with 2 players", () => {
    expect(roomLayout({ settings: { type: "multiplayer" }, startingPlayers: 2 })).toBe("duel");
  });

  it.each([3, 4, 25])("is the game board for a Multiplayer game that started with %i players", (count) => {
    expect(roomLayout({ settings: { type: "multiplayer" }, startingPlayers: count })).toBe("board");
  });

  it("is the game board when the reply has no settings or no start count (an older server)", () => {
    expect(roomLayout({ startingPlayers: undefined })).toBe("board");
    expect(roomLayout({ settings: { type: "multiplayer" }, startingPlayers: null })).toBe("board");
  });
});

// The two sides of the duel layout: the viewer at the bottom, the opponent at the top, both with their score.
// Scores come from the standings, which count closed rounds only, so they change after each round.
describe("duelSides", () => {
  const state = (overrides: object = {}) => ({
    players: ["Anna", "Ben"],
    away: [] as string[],
    me: { nickname: "Ben" },
    standings: [
      { rank: 1, nickname: "Anna", score: 950 },
      { rank: 2, nickname: "Ben", score: 400 },
    ],
    ...overrides,
  });

  it("puts the viewer at the bottom and the other player on top, each with their score", () => {
    expect(duelSides(state(), [])).toEqual({
      me: { nickname: "Ben", score: 400 },
      opponent: { nickname: "Anna", score: 950, answered: false, away: false },
    });
  });

  it("shows the room creator's view the other way round", () => {
    expect(duelSides(state({ me: { nickname: "Anna" } }), [])).toEqual({
      me: { nickname: "Anna", score: 950 },
      opponent: { nickname: "Ben", score: 400, answered: false, away: false },
    });
  });

  it("ticks the opponent once they have answered the round on screen", () => {
    expect(duelSides(state(), ["Anna"]).opponent).toMatchObject({ answered: true });
    expect(duelSides(state(), ["Ben"]).opponent).toMatchObject({ answered: false });
  });

  it("shows the new scores after a round closes", () => {
    const after = state({
      standings: [
        { rank: 1, nickname: "Ben", score: 1300 },
        { rank: 2, nickname: "Anna", score: 950 },
      ],
    });
    expect(duelSides(after, [])).toMatchObject({ me: { score: 1300 }, opponent: { score: 950 } });
  });

  it("marks an opponent whose device has not asked for 5 s as away", () => {
    expect(duelSides(state({ away: ["Anna"] }), []).opponent).toMatchObject({ away: true });
  });

  it("has no opponent once the other player has left the game", () => {
    const alone = state({ players: ["Ben"], standings: [{ rank: 1, nickname: "Ben", score: 400 }] });
    expect(duelSides(alone, [])).toEqual({ me: { nickname: "Ben", score: 400 }, opponent: null });
  });

  it("counts 0 points for a player the standings do not list yet", () => {
    expect(duelSides(state({ standings: [] }), [])).toMatchObject({ me: { score: 0 }, opponent: { score: 0 } });
  });
});
