import { describe, expect, it, vi } from "vitest";
import { apiStartGame } from "@/lib/client/game-api";

// Starting a game in a chosen mode (spec 003). No network: fetch is a fake.
function reply() {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify({ gameId: "g", previewUrls: [] }), { status: 201 }),
  );
}

describe("apiStartGame with a mode", () => {
  it("sends the chosen mode as JSON", async () => {
    for (const mode of ["title", "artist", "year", "mixed"] as const) {
      const fetchFn = reply();
      await apiStartGame(fetchFn, mode);
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe("/api/games");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ mode });
    }
  });

  it("sends no body without a mode, like before", async () => {
    const fetchFn = reply();
    await apiStartGame(fetchFn);
    expect(fetchFn.mock.calls[0][1]?.body).toBeUndefined();
  });
});
