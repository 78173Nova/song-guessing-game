import { describe, expect, it, vi } from "vitest";
import { apiSoloMatchingSongs } from "@/lib/client/game-api";

// Loading the three numbers for the chosen genre + decade on the solo start screen (issue #7).
// No network: fetch is a fake.
function reply(status: number, body: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

const NUMBERS = { songs: 12, titles: 12, artists: 9 };

describe("apiSoloMatchingSongs", () => {
  it("Any + Any: asks /api/games/matching-songs with no query, as a GET that is never cached", async () => {
    const fetchFn = reply(200, NUMBERS);
    expect(await apiSoloMatchingSongs({}, fetchFn)).toEqual(NUMBERS);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/games/matching-songs");
    expect(fetchFn.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(fetchFn.mock.calls[0][1]?.cache).toBe("no-store");
  });

  it("sends only the chosen filters, with the genre made safe for the address (r&b)", async () => {
    const fetchFn = reply(200, NUMBERS);
    await apiSoloMatchingSongs({ genre: "r&b", decade: 1980 }, fetchFn);
    await apiSoloMatchingSongs({ decade: 2020 }, fetchFn);
    await apiSoloMatchingSongs({ genre: "rock" }, fetchFn);
    expect(fetchFn.mock.calls.map((call) => call[0])).toEqual([
      "/api/games/matching-songs?genre=r%26b&decade=1980",
      "/api/games/matching-songs?decade=2020",
      "/api/games/matching-songs?genre=rock",
    ]);
  });

  it("returns null when the server cannot be reached – the screen then greys out no mode", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await apiSoloMatchingSongs({}, fetchFn)).toBeNull();
  });

  it("returns null for an error reply or a reply that is not JSON", async () => {
    expect(await apiSoloMatchingSongs({}, reply(400, { error: "invalid-genre", message: "..." }))).toBeNull();
    expect(await apiSoloMatchingSongs({}, reply(500, { error: "server-error", message: "..." }))).toBeNull();
    expect(await apiSoloMatchingSongs({}, reply(200, "<html>"))).toBeNull();
  });

  it("returns null for a reply in the wrong shape", async () => {
    expect(await apiSoloMatchingSongs({}, reply(200, {}))).toBeNull();
    expect(await apiSoloMatchingSongs({}, reply(200, null))).toBeNull();
    expect(await apiSoloMatchingSongs({}, reply(200, { songs: 12, titles: 12 }))).toBeNull();
    expect(await apiSoloMatchingSongs({}, reply(200, { songs: "12", titles: 12, artists: 9 }))).toBeNull();
    expect(await apiSoloMatchingSongs({}, reply(200, { songs: 12, titles: 1.5, artists: 9 }))).toBeNull();
    expect(await apiSoloMatchingSongs({}, reply(200, { songs: 12, titles: 12, artists: -1 }))).toBeNull();
  });
});
