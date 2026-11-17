import { describe, expect, it, vi } from "vitest";
import { apiStartGame } from "@/lib/client/game-api";

// Starting a game with genre and decade filters (spec 003, step 5). No network: fetch is a fake.
function reply(status = 201, body: unknown = { gameId: "g", previewUrls: [] }) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

const sentBody = (fetchFn: ReturnType<typeof reply>) => JSON.parse(String(fetchFn.mock.calls[0][1]?.body));

describe("apiStartGame with filters", () => {
  it("sends the mode, genre and decade as JSON", async () => {
    const fetchFn = reply();
    await apiStartGame(fetchFn, "artist", { genre: "rock", decade: 1980 });
    expect(sentBody(fetchFn)).toEqual({ mode: "artist", genre: "rock", decade: 1980 });
  });

  it("leaves out a filter that is Any", async () => {
    const genreOnly = reply();
    await apiStartGame(genreOnly, "title", { genre: "pop" });
    expect(sentBody(genreOnly)).toEqual({ mode: "title", genre: "pop" });

    const none = reply();
    await apiStartGame(none, "year", {});
    expect(sentBody(none)).toEqual({ mode: "year" });
  });

  it("marks a 'too few songs' refusal, so the start screen can show it", async () => {
    const message = "Only 3 songs match these filters – try 'Any' for genre or decade.";
    const fetchFn = reply(422, { error: "too-few-songs", message });
    expect(await apiStartGame(fetchFn, "title", { genre: "hip-hop" })).toEqual({ ok: false, message, tooFewSongs: true });
  });

  it("other errors are not marked as 'too few songs'", async () => {
    const fetchFn = reply(400, { error: "invalid-genre", message: "Please choose a genre from the list." });
    expect(await apiStartGame(fetchFn, "title", { genre: "pop" })).toEqual({
      ok: false,
      message: "Please choose a genre from the list.",
    });
  });
});
