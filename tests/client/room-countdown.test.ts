import { describe, expect, it, vi } from "vitest";
import { apiExtendCountdown, type ListedRoom, type RoomState } from "@/lib/client/room-api";
import { formatCountdown, lobbyCountdown } from "@/lib/client/room-game";
import { listedRoomCountdown } from "@/lib/client/room-list";

// The browser side of the lobby countdown (issue #37). The server works out the end; the page only shows it.
// No network: fetch is a fake, and the "local clock" is a number we pass in.
const TOKEN = "ab".repeat(32);
const T0 = Date.parse("2026-11-15T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function reply(status: number, body: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

describe("apiExtendCountdown", () => {
  it("posts to the extend route with the token and passes on the new end, or the refusal", async () => {
    const fetchFn = reply(200, { endsAt: iso(T0), extensions: 1 });
    expect(await apiExtendCountdown("482913", TOKEN, fetchFn)).toEqual({
      ok: true,
      data: { endsAt: iso(T0), extensions: 1 },
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/rooms/482913/extend");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);

    const early = reply(409, { error: "too-early-to-extend", message: "Not yet." });
    expect(await apiExtendCountdown("482913", TOKEN, early)).toEqual({ ok: false, message: "Not yet." });
  });
});

describe("formatCountdown", () => {
  it("shows whole seconds left as m:ss, rounding up and never below 0:00", () => {
    expect(formatCountdown(60_000)).toBe("1:00");
    expect(formatCountdown(59_001)).toBe("1:00");
    expect(formatCountdown(42_000)).toBe("0:42");
    expect(formatCountdown(5 * 60_000 + 9_000)).toBe("5:09");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-3_000)).toBe("0:00");
  });
});

describe("lobbyCountdown", () => {
  const lobby = (countdown: RoomState["countdown"]) =>
    ({ status: "lobby", serverNow: iso(T0), countdown }) as RoomState;

  it("is null without a countdown", () => {
    expect(lobbyCountdown(lobby(null), 0, T0)).toBeNull();
    expect(lobbyCountdown(lobby(undefined), 0, T0)).toBeNull();
  });

  it("counts down on the server's clock, using this device's offset", () => {
    const state = lobby({ endsAt: iso(T0 + 60_000), extensions: 0, canExtend: false });
    // This device's clock is 2 s behind the server's.
    expect(lobbyCountdown(state, 2_000, T0 - 2_000 + 18_000)).toEqual({ text: "0:42", canExtend: false });
  });

  it("passes on whether this viewer may extend now", () => {
    const state = lobby({ endsAt: iso(T0 + 10_000), extensions: 2, canExtend: true });
    expect(lobbyCountdown(state, 0, T0)).toEqual({ text: "0:10", canExtend: true });
  });
});

describe("listedRoomCountdown – the countdown in the list", () => {
  const room: ListedRoom = {
    code: "482913",
    creator: "Anna",
    type: "multiplayer",
    mode: "title",
    genres: "any",
    decades: "any",
    songsPerSet: 5,
    sets: 1,
    players: 2,
    maxPlayers: 25,
  };

  it("shows when the game starts, or nothing while the countdown does not run", () => {
    expect(listedRoomCountdown({ ...room, countdownEndsAt: iso(T0 + 42_000) }, T0)).toBe("Starts in 0:42");
    expect(listedRoomCountdown({ ...room, countdownEndsAt: null }, T0)).toBeNull();
    expect(listedRoomCountdown(room, T0)).toBeNull();
  });
});
