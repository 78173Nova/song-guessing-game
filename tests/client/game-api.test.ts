import { describe, expect, it, vi } from "vitest";
import {
  apiAnswer,
  apiNextRound,
  apiReplace,
  apiStartGame,
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from "@/lib/client/game-api";

const GAME = "3f2b8c1e-9a4d-4e7b-b1c2-8d5e6f7a9b0c";

function reply(status: number, body: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

describe("game API calls from the browser", () => {
  it("starts a game and loads the next round", async () => {
    const previewUrls = [1, 2, 3, 4, 5].map((n) => `https://audio.example.com/${n}.m4a`);
    const start = reply(201, { gameId: GAME, previewUrls });
    expect(await apiStartGame(start)).toEqual({ ok: true, data: { gameId: GAME, previewUrls } });
    expect(start).toHaveBeenCalledWith("/api/games", expect.objectContaining({ method: "POST" }));

    const roundData = { round: 1, totalRounds: 5, previewUrl: "https://audio.example.com/1.m4a", options: ["A", "B", "C", "D"] };
    const next = reply(200, roundData);
    expect(await apiNextRound(GAME, next)).toEqual({ ok: true, data: roundData });
    expect(next).toHaveBeenCalledWith(`/api/games/${GAME}/next`, expect.objectContaining({ method: "POST" }));
  });

  it("sends the answer as JSON with round and answer", async () => {
    const fetchFn = reply(200, { correct: true, points: 140, totalScore: 140, correctOption: 2, song: {} });
    await apiAnswer(GAME, 3, "skip", fetchFn);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`/api/games/${GAME}/answer`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ round: 3, answer: "skip" });
  });

  it("passes on the server's message when the server answers with an error", async () => {
    const message = "The music source is not reachable right now. Please try again in a moment.";
    const fetchFn = reply(503, { error: "not-enough-songs", message });
    expect(await apiStartGame(fetchFn)).toEqual({ ok: false, message });
  });

  it("returns the network message when the server cannot be reached", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await apiStartGame(fetchFn)).toEqual({ ok: false, message: NETWORK_ERROR_MESSAGE });
  });

  it("returns a general message when the reply is not JSON", async () => {
    expect(await apiStartGame(reply(502, "<html>Bad gateway</html>"))).toEqual({ ok: false, message: GENERIC_ERROR_MESSAGE });
    expect(await apiNextRound(GAME, reply(200, "not json"))).toEqual({ ok: false, message: GENERIC_ERROR_MESSAGE });
  });

  it("asks the server to replace a round's song and passes on its error message", async () => {
    const fetchFn = reply(200, { round: 2, previewUrl: "https://audio.example.com/new.m4a" });
    expect(await apiReplace(GAME, 2, fetchFn)).toEqual({ ok: true, data: { round: 2, previewUrl: "https://audio.example.com/new.m4a" } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`/api/games/${GAME}/replace`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ round: 2 });

    const refused = reply(409, { error: "round-already-started", message: "This round has already started." });
    expect(await apiReplace(GAME, 1, refused)).toEqual({ ok: false, message: "This round has already started." });
  });
});
