import { describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from "@/lib/client/game-api";
import { DEFAULT_ROOM_SETTINGS } from "@/lib/game/room-settings";
import {
  apiAnswerRoom,
  apiCreateRoom,
  apiJoinRoom,
  apiKickPlayer,
  apiLeaveRoom,
  apiReportClip,
  apiRoomState,
  apiStartRoom,
} from "@/lib/client/room-api";

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
  it("creates a room with the nickname, avatar and settings as JSON", async () => {
    const fetchFn = reply(201, { code: "482913", playerToken: TOKEN, nickname: "Anna" });

    expect(await apiCreateRoom({ nickname: "Anna", avatar: "fox" }, DEFAULT_ROOM_SETTINGS, fetchFn)).toEqual({
      ok: true,
      data: { code: "482913", playerToken: TOKEN, nickname: "Anna" },
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ nickname: "Anna", avatar: "fox", settings: DEFAULT_ROOM_SETTINGS });
  });

  it("joins a room and returns the code with the token", async () => {
    const fetchFn = reply(201, { playerToken: TOKEN, nickname: "Ben" });

    expect(await apiJoinRoom("482913", { nickname: "Ben", avatar: "owl" }, fetchFn)).toEqual({
      ok: true,
      data: { code: "482913", playerToken: TOKEN, nickname: "Ben" },
    });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/rooms/482913/join");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ nickname: "Ben", avatar: "owl" });
  });

  it("passes on the server's message when a join is refused", async () => {
    const fetchFn = reply(409, { error: "room-full", message: "This room is full." });
    expect(await apiJoinRoom("482913", { nickname: "Ben", avatar: "owl" }, fetchFn)).toEqual({ ok: false, message: "This room is full." });
  });

  it("starts with the token in the Authorization header", async () => {
    const fetchFn = reply(200, { totalRounds: 5, previewUrls: [] });

    expect((await apiStartRoom("482913", TOKEN, fetchFn)).ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms/482913/start");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("sends an answer with the round, the option and the token, and passes on a refusal", async () => {
    const fetchFn = reply(200, { round: 2, answer: 3 });

    expect(await apiAnswerRoom("482913", TOKEN, 2, 3, fetchFn)).toEqual({ ok: true, data: { round: 2, answer: 3 } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms/482913/answer");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ round: 2, answer: 3 });
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");

    const late = reply(409, { error: "too-late", message: "Too late – the time for this round is over." });
    expect(await apiAnswerRoom("482913", TOKEN, 2, 3, late)).toEqual({
      ok: false,
      message: "Too late – the time for this round is over.",
    });
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

  it("reports a clip that will not load with the round and the token, and returns the new clip", async () => {
    const fetchFn = reply(200, { round: 3, previewUrl: "https://audio.example.com/new.m4a" });

    expect(await apiReportClip("482913", TOKEN, 3, fetchFn)).toEqual({
      ok: true,
      data: { round: 3, previewUrl: "https://audio.example.com/new.m4a" },
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms/482913/replace");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ round: 3 });
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);

    const refused = reply(409, { error: "already-swapped", message: "This round's song has already been swapped once." });
    expect(await apiReportClip("482913", TOKEN, 3, refused)).toEqual({
      ok: false,
      message: "This round's song has already been swapped once.",
    });
  });

  it("leaves the room with the token (issue #40)", async () => {
    const fetchFn = reply(200, { left: true, roomClosed: false });

    expect(await apiLeaveRoom("482913", TOKEN, fetchFn)).toEqual({ ok: true, data: { left: true, roomClosed: false } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms/482913/leave");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("kicks a player by nickname with the creator's token, and passes on a refusal", async () => {
    const fetchFn = reply(200, { nickname: "Ben" });

    expect(await apiKickPlayer("482913", TOKEN, "Ben", fetchFn)).toEqual({ ok: true, data: { nickname: "Ben" } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms/482913/kick");
    expect(JSON.parse(String(init?.body))).toEqual({ nickname: "Ben" });
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);

    const early = reply(409, { error: "not-away-long-enough", message: "Not yet." });
    expect(await apiKickPlayer("482913", TOKEN, "Ben", early)).toEqual({ ok: false, message: "Not yet." });
  });

  it("sends the tab's old token along when joining again, so a kicked player is refused", async () => {
    const fetchFn = reply(403, { error: "kicked", message: "The room creator removed you from this room." });

    expect(await apiJoinRoom("482913", { nickname: "Benny", avatar: "owl" }, fetchFn, TOKEN)).toEqual({
      ok: false,
      message: "The room creator removed you from this room.",
    });
    expect(new Headers(fetchFn.mock.calls[0][1]?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("says 'removed' when this tab left the game or was kicked, so the page shows no nickname form", async () => {
    const kicked = reply(403, { error: "kicked", message: "The room creator removed you from this room." });
    expect(await apiRoomState("482913", TOKEN, kicked)).toEqual({
      ok: false,
      reason: "removed",
      message: "The room creator removed you from this room.",
    });
    const left = reply(403, { error: "left", message: "You have left this room." });
    expect(await apiRoomState("482913", TOKEN, left)).toMatchObject({ ok: false, reason: "removed" });
  });
});
