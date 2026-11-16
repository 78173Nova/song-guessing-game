import { describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from "@/lib/client/game-api";
import { apiCreateRoom, apiJoinRoom, apiRoomState, apiStartRoom } from "@/lib/client/room-api";

const TOKEN = "ab".repeat(32);

function reply(status: number, body: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

const lobby = {
  code: "482913",
  status: "lobby",
  role: "creator",
  players: ["Anna", "Ben"],
  me: { nickname: "Anna" },
};

describe("room API calls from the browser", () => {
  it("creates a room with the nickname as JSON", async () => {
    const fetchFn = reply(201, { code: "482913", playerToken: TOKEN, nickname: "Anna" });

    expect(await apiCreateRoom("Anna", fetchFn)).toEqual({
      ok: true,
      data: { code: "482913", playerToken: TOKEN, nickname: "Anna" },
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ nickname: "Anna" });
  });

  it("joins a room and returns the code with the token", async () => {
    const fetchFn = reply(201, { playerToken: TOKEN, nickname: "Ben" });

    expect(await apiJoinRoom("482913", "Ben", fetchFn)).toEqual({
      ok: true,
      data: { code: "482913", playerToken: TOKEN, nickname: "Ben" },
    });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/rooms/482913/join");
  });

  it("passes on the server's message when a join is refused", async () => {
    const fetchFn = reply(409, { error: "room-full", message: "This room is full." });
    expect(await apiJoinRoom("482913", "Ben", fetchFn)).toEqual({ ok: false, message: "This room is full." });
  });

  it("starts with the token in the Authorization header", async () => {
    const fetchFn = reply(200, { totalRounds: 5, previewUrls: [] });

    expect((await apiStartRoom("482913", TOKEN, fetchFn)).ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms/482913/start");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("asks for the state with the token, or without a header when this tab has none", async () => {
    const withToken = reply(200, lobby);
    expect(await apiRoomState("482913", TOKEN, withToken)).toEqual({ ok: true, state: lobby });
    expect(new Headers(withToken.mock.calls[0][1]?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);

    const without = reply(403, { error: "wrong-token", message: "Not in this room." });
    await apiRoomState("482913", null, without);
    expect(new Headers(without.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
  });

  it("says why there is no state: gone (404/409), not in the room (403), or an error", async () => {
    expect(await apiRoomState("482913", null, reply(404, { message: "There is no room with this code." }))).toEqual({
      ok: false,
      reason: "gone",
      message: "There is no room with this code.",
    });
    expect(await apiRoomState("482913", TOKEN, reply(409, { message: "This room has closed." }))).toEqual({
      ok: false,
      reason: "gone",
      message: "This room has closed.",
    });
    expect(await apiRoomState("482913", null, reply(403, { message: "Join first." }))).toMatchObject({
      ok: false,
      reason: "not-in",
    });
    expect(await apiRoomState("482913", TOKEN, reply(500, { message: "Server trouble." }))).toEqual({
      ok: false,
      reason: "error",
      message: "Server trouble.",
    });
  });

  it("never throws: no connection and a reply that is not JSON become errors", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await apiRoomState("482913", TOKEN, offline)).toEqual({
      ok: false,
      reason: "error",
      message: NETWORK_ERROR_MESSAGE,
    });
    expect(await apiRoomState("482913", TOKEN, reply(200, "<html>"))).toEqual({
      ok: false,
      reason: "error",
      message: GENERIC_ERROR_MESSAGE,
    });
  });
});
