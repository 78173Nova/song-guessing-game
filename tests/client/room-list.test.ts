import { describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR_MESSAGE } from "@/lib/client/game-api";
import { apiCreateRoom, apiListRooms, type ListedRoom } from "@/lib/client/room-api";
import { describeListedRoom } from "@/lib/client/room-list";

// The browser side of public rooms and the "Join a room" list (issue #36). No network: fetch is a fake.
function reply(status: number, body: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

const SETTINGS = { type: "multiplayer", mode: "title", genres: "any", decades: "any", songsPerSet: 5, sets: 1 } as const;

const ROOM: ListedRoom = {
  code: "482913",
  creator: "Anna",
  type: "multiplayer",
  mode: "artist",
  genres: ["pop", "r&b"],
  decades: [1980, 1990],
  songsPerSet: 5,
  sets: 2,
  players: 7,
  maxPlayers: 25,
};

describe("creating a public or private room", () => {
  it("sends private: true only when private is chosen", async () => {
    const fetchFn = reply(201, { code: "482913", playerToken: "ab".repeat(32), nickname: "Anna" });
    await apiCreateRoom("Anna", fetchFn, SETTINGS, true);
    await apiCreateRoom("Anna", fetchFn, SETTINGS, false);
    await apiCreateRoom("Anna", fetchFn, SETTINGS);

    const bodies = fetchFn.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      { nickname: "Anna", settings: SETTINGS, private: true },
      { nickname: "Anna", settings: SETTINGS },
      { nickname: "Anna", settings: SETTINGS },
    ]);
  });
});

describe("apiListRooms", () => {
  it("asks for the list with every filter in the query, and never from the cache", async () => {
    const fetchFn = reply(200, { rooms: [ROOM] });

    expect(
      await apiListRooms({ type: "duel", mode: "any", genres: ["pop", "r&b"], decades: [1980, 2010] }, fetchFn),
    ).toEqual({ ok: true, rooms: [ROOM] });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms?type=duel&mode=any&genres=pop%2Cr%26b&decades=1980%2C2010");
    expect(init?.cache).toBe("no-store");
  });

  it("sends 'any' for genres and decades left on Any", async () => {
    const fetchFn = reply(200, { rooms: [] });
    expect(await apiListRooms({ type: "multiplayer", mode: "title", genres: "any", decades: "any" }, fetchFn)).toEqual({
      ok: true,
      rooms: [],
    });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/rooms?type=multiplayer&mode=title&genres=any&decades=any");
  });

  it("returns the server's message when the filters are refused, and a clear message without a connection", async () => {
    const refused = reply(400, { error: "invalid-filter", message: "Please choose valid filters." });
    expect(await apiListRooms({ type: "duel", mode: "any", genres: "any", decades: "any" }, refused)).toEqual({
      ok: false,
      message: "Please choose valid filters.",
    });

    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await apiListRooms({ type: "duel", mode: "any", genres: "any", decades: "any" }, offline)).toEqual({
      ok: false,
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it("treats a reply without a room list as an error", async () => {
    const result = await apiListRooms({ type: "duel", mode: "any", genres: "any", decades: "any" }, reply(200, "oops"));
    expect(result.ok).toBe(false);
  });
});

describe("describeListedRoom", () => {
  it("shows the creator, mode, genres, decades, songs × sets and players", () => {
    expect(describeListedRoom(ROOM)).toEqual({
      creator: "Anna",
      mode: "Artist",
      genres: "Pop, R&B / Soul",
      decades: "1980s, 1990s",
      songs: "5 songs × 2 sets",
      players: "7 / 25",
    });
  });

  it("says Any for genres and decades set to Any, and uses the singular for one set", () => {
    expect(
      describeListedRoom({ ...ROOM, mode: "mixed", genres: "any", decades: "any", songsPerSet: 3, sets: 1, players: 1, maxPlayers: 2 }),
    ).toEqual({
      creator: "Anna",
      mode: "Mixed",
      genres: "Any genre",
      decades: "Any decade",
      songs: "3 songs × 1 set",
      players: "1 / 2",
    });
  });
});
