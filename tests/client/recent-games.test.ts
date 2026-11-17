import { describe, expect, it, vi } from "vitest";
import { apiStartGame } from "@/lib/client/game-api";
import { gameReducer, type GameAction, type GameState } from "@/lib/client/game-state";
import { rememberGame } from "@/lib/client/recent-games";

// The browser remembers its last 3 games (in memory only) and sends them with the next start (spec 003).
const A = "3f2b8c1e-9a4d-4e7b-b1c2-8d5e6f7a9b0c";
const B = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const C = "ffffffff-ffff-4fff-bfff-ffffffffffff";
const D = "11111111-2222-4333-8444-555555555555";

describe("rememberGame", () => {
  it("puts the newest game first", () => {
    expect(rememberGame([], A)).toEqual([A]);
    expect(rememberGame([A], B)).toEqual([B, A]);
  });

  it("keeps at most 3 games, dropping the oldest", () => {
    expect(rememberGame([C, B, A], D)).toEqual([D, C, B]);
  });

  it("does not list the same game twice", () => {
    expect(rememberGame([B, A], A)).toEqual([A, B]);
  });

  it("does not change the list it was given", () => {
    const before = [B, A];
    rememberGame(before, C);
    expect(before).toEqual([B, A]);
  });
});

function reply() {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify({ gameId: "g", previewUrls: [] }), { status: 201 }),
  );
}

describe("apiStartGame with recent games", () => {
  it("sends the recent games with the mode and filters", async () => {
    const fetchFn = reply();
    await apiStartGame(fetchFn, "title", { genre: "rock" }, [B, A]);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ mode: "title", genre: "rock", recentGames: [B, A] });
  });

  it("leaves the field out when there are no recent games", async () => {
    const fetchFn = reply();
    await apiStartGame(fetchFn, "title", {}, []);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ mode: "title" });
  });
});

describe("gameReducer – 'Change settings' on the results screen", () => {
  it("goes from the results back to the start screen, with no message", () => {
    const results: GameState = { screen: "results", score: 300, history: [] };
    const action: GameAction = { type: "reset" };
    expect(gameReducer(results, action)).toEqual({ screen: "start" });
  });
});
