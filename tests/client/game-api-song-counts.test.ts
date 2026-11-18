import { describe, expect, it, vi } from "vitest";
import { apiSongCounts } from "@/lib/client/game-api";

// Loading the playable song counts for the start screen (spec 003, "filter gaps"). No network: fetch is a fake.
function reply(status: number, body: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

const COUNTS = [
  { genre: "rock", decade: 1980, count: 10 },
  { genre: "hip-hop", decade: 2020, count: 4 },
];

describe("apiSongCounts", () => {
  it("asks /api/games/song-counts with a GET and returns the counts", async () => {
    const fetchFn = reply(200, { counts: COUNTS });
    expect(await apiSongCounts(fetchFn)).toEqual(COUNTS);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/games/song-counts");
    expect(fetchFn.mock.calls[0][1]?.method ?? "GET").toBe("GET");
  });

  it("returns null when the server cannot be reached – the screen then greys out nothing", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await apiSongCounts(fetchFn)).toBeNull();
  });

  it("returns null for an error reply or a reply that is not JSON", async () => {
    expect(await apiSongCounts(reply(500, { error: "server-error", message: "..." }))).toBeNull();
    expect(await apiSongCounts(reply(200, "<html>"))).toBeNull();
  });

  it("returns null for a reply in the wrong shape", async () => {
    expect(await apiSongCounts(reply(200, {}))).toBeNull();
    expect(await apiSongCounts(reply(200, { counts: "many" }))).toBeNull();
    expect(await apiSongCounts(reply(200, { counts: [{ genre: "rock", decade: "1980", count: 3 }] }))).toBeNull();
  });
});
