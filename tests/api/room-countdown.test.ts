import { beforeEach, describe, expect, it } from "vitest";
import {
  createNewRoom,
  extendRoomCountdown,
  getRoomState,
  joinRoom,
  listPublicRooms,
  playerLeavesRoom,
} from "@/lib/api/rooms";
import type { TransactionDb } from "@/lib/db/client";
import { withDefaultSettings } from "../helpers/rooms";
import { loggedInSession } from "../helpers/session";
import { addTestSongs } from "../helpers/songs";
import { createTestDb } from "../helpers/test-db";

// The lobby countdown of public rooms (issue #37), through the room API against PGlite. The clock only moves when a
// test moves it. 60 s from the moment the room has 2 players; the room creator can add 60 s in the last 15 s, at most
// 5 times; at 0 the game starts by itself. Private rooms have no countdown.
let db: TransactionDb;
let clock: Date;
let nextCode: number;
let session: string;
const deps = { now: () => clock };
const START = new Date("2026-11-15T12:00:00.000Z");

function wait(seconds: number) {
  clock = new Date(clock.getTime() + seconds * 1000);
}
const later = (from: Date, seconds: number) => new Date(from.getTime() + seconds * 1000).toISOString();

beforeEach(async () => {
  db = await createTestDb();
  await addTestSongs(db, 8);
  clock = START;
  nextCode = 482913;
  session = await loggedInSession(db, START);
});

const bearer = (token: string) => `Bearer ${token}`;
const state = (code: string, token: string) => getRoomState(db, code, bearer(token), deps);
const extend = (code: string, token: string) => extendRoomCountdown(db, code, bearer(token), deps);
const leave = (code: string, token: string) => playerLeavesRoom(db, code, bearer(token), deps);
const list = () =>
  listPublicRooms(db, new URLSearchParams({ type: "multiplayer", mode: "any", genres: "any", decades: "any" }), deps);

async function newRoom(isPrivate = false) {
  const result = await createNewRoom(db, session, JSON.stringify(withDefaultSettings({ nickname: "Anna", private: isPrivate })), {
    ...deps,
    newCode: () => String(nextCode++),
  });
  if (result.status !== 201) throw new Error("Test setup: the room was not created");
  const { code, playerToken } = result.body as { code: string; playerToken: string };
  return { code, creatorToken: playerToken };
}

async function joined(code: string, nickname: string): Promise<string> {
  const result = await joinRoom(db, code, JSON.stringify({ nickname }), deps);
  if (result.status !== 201) throw new Error(`Test setup: ${nickname} could not join (${JSON.stringify(result.body)})`);
  return (result.body as { playerToken: string }).playerToken;
}

type Countdown = { endsAt: string; extensions: number; canExtend: boolean } | null;

async function countdownOf(code: string, token: string): Promise<Countdown> {
  const result = await state(code, token);
  if (result.status !== 200) throw new Error(`State refused (${JSON.stringify(result.body)})`);
  return (result.body as { countdown: Countdown }).countdown;
}

async function statusOf(code: string, token: string): Promise<string> {
  return ((await state(code, token)).body as { status: string }).status;
}

async function listedCountdown(code: string): Promise<string | null | undefined> {
  const rooms = (await list()).body as { rooms: { code: string; countdownEndsAt: string | null }[] };
  return rooms.rooms.find((room) => room.code === code)?.countdownEndsAt;
}

// A public room with Anna (creator) and Ben; the countdown starts at the moment Ben joins.
async function countingRoom() {
  const room = await newRoom();
  wait(3);
  const joinedAt = clock;
  const ben = await joined(room.code, "Ben");
  return { ...room, ben, joinedAt };
}

describe("the lobby countdown – when it runs", () => {
  it("does not run in a public room with only the room creator", async () => {
    const { code, creatorToken } = await newRoom();
    expect(await countdownOf(code, creatorToken)).toBeNull();
    expect(await listedCountdown(code)).toBeNull();
    wait(5 * 60);
    expect(await statusOf(code, creatorToken)).toBe("lobby");
  });

  it("starts at 60 s when the second player joins, and everyone in the lobby and the list sees the same end", async () => {
    const { code, creatorToken, ben, joinedAt } = await countingRoom();
    const endsAt = later(joinedAt, 60);
    wait(10);
    expect(await countdownOf(code, creatorToken)).toEqual({ endsAt, extensions: 0, canExtend: false });
    expect(await countdownOf(code, ben)).toEqual({ endsAt, extensions: 0, canExtend: false });
    expect(await listedCountdown(code)).toBe(endsAt);
  });

  it("keeps counting from the second player's join when more players join", async () => {
    const { code, creatorToken, joinedAt } = await countingRoom();
    wait(20);
    await joined(code, "Cleo");
    expect((await countdownOf(code, creatorToken))?.endsAt).toBe(later(joinedAt, 60));
  });

  it("stops when the lobby drops below 2 players, and starts again from the next join", async () => {
    const { code, creatorToken, ben } = await countingRoom();
    wait(30);
    expect((await leave(code, ben)).status).toBe(200);
    expect(await countdownOf(code, creatorToken)).toBeNull();
    expect(await listedCountdown(code)).toBeNull();

    wait(50); // longer than the 30 s that were left: nothing starts with 1 player
    expect(await statusOf(code, creatorToken)).toBe("lobby");
    const rejoinedAt = clock;
    await joined(code, "Cleo");
    expect((await countdownOf(code, creatorToken))?.endsAt).toBe(later(rejoinedAt, 60));
  });

  it("never runs in a private room", async () => {
    const { code, creatorToken } = await newRoom(true);
    const ben = await joined(code, "Ben");
    expect(await countdownOf(code, creatorToken)).toBeNull();
    expect(await countdownOf(code, ben)).toBeNull();
    wait(45);
    expect(await extend(code, creatorToken)).toMatchObject({ status: 409, body: { error: "no-countdown" } });
    wait(5 * 60);
    expect(await statusOf(code, creatorToken)).toBe("lobby");
  });
});

describe("the lobby countdown – starting at 0", () => {
  it("starts the game at 0 without anyone tapping Start", async () => {
    const { code, creatorToken, ben } = await countingRoom();
    wait(59.999);
    expect(await statusOf(code, ben)).toBe("lobby");
    wait(0.001);
    expect(await statusOf(code, ben)).toBe("playing");
    const after = (await state(code, creatorToken)).body as { countdown: Countdown; nextRound: { number: number } };
    expect(after.countdown).toBeNull();
    expect(after.nextRound.number).toBe(1);
  });

  it("starts a game nobody looked at for a while on the next request, and refuses joins after 0", async () => {
    const { code, ben } = await countingRoom();
    wait(90);
    expect((await joinRoom(db, code, JSON.stringify({ nickname: "Cleo" }), deps)).body).toMatchObject({
      error: "room-started",
    });
    expect(await statusOf(code, ben)).toBe("playing");
  });

  it("takes a room off the list once its countdown is over", async () => {
    const { code } = await countingRoom();
    wait(59.999);
    expect(await listedCountdown(code)).toBeDefined();
    wait(0.001);
    expect(await listedCountdown(code)).toBeUndefined();
  });
});

describe("POST /api/rooms/[code]/extend – Extend +60 s", () => {
  it("is refused before the last 15 s (44.999 s) and accepted from 45 s, adding 60 s", async () => {
    const { code, creatorToken, joinedAt } = await countingRoom();
    wait(44.999);
    expect((await countdownOf(code, creatorToken))?.canExtend).toBe(false);
    expect(await extend(code, creatorToken)).toMatchObject({ status: 409, body: { error: "too-early-to-extend" } });

    wait(0.001); // 45 s: exactly 15 s left
    expect((await countdownOf(code, creatorToken))?.canExtend).toBe(true);
    const endsAt = later(joinedAt, 120);
    expect(await extend(code, creatorToken)).toEqual({ status: 200, body: { endsAt, extensions: 1 } });
    expect(await countdownOf(code, creatorToken)).toEqual({ endsAt, extensions: 1, canExtend: false });
    expect(await listedCountdown(code)).toBe(endsAt);
  });

  it("is accepted at 46 s, and the game then starts at the new end", async () => {
    const { code, creatorToken, ben } = await countingRoom();
    wait(46);
    expect((await extend(code, creatorToken)).status).toBe(200);
    wait(14); // the old end
    expect(await statusOf(code, ben)).toBe("lobby");
    wait(59.999);
    expect(await statusOf(code, ben)).toBe("lobby");
    wait(0.001);
    expect(await statusOf(code, ben)).toBe("playing");
  });

  it("is refused for anyone but the room creator, who never sees the button", async () => {
    const { code, ben } = await countingRoom();
    wait(50);
    expect((await countdownOf(code, ben))?.canExtend).toBe(false);
    expect(await extend(code, ben)).toMatchObject({ status: 403, body: { error: "not-creator" } });
    expect((await countdownOf(code, ben))?.extensions).toBe(0);
  });

  it("allows at most 5 extensions", async () => {
    const { code, creatorToken, ben, joinedAt } = await countingRoom();
    wait(45);
    for (let n = 1; n <= 5; n++) {
      expect((await extend(code, creatorToken)).status).toBe(200);
      wait(60); // each time back to exactly 15 s before the end
    }
    // 45 + 5 × 60 s after the join: 15 s left, but the limit is reached.
    expect(await countdownOf(code, creatorToken)).toEqual({
      endsAt: later(joinedAt, 360),
      extensions: 5,
      canExtend: false,
    });
    expect(await extend(code, creatorToken)).toMatchObject({ status: 409, body: { error: "no-more-extensions" } });
    wait(15);
    expect(await statusOf(code, ben)).toBe("playing");
  });

  it("counts two extends at the same moment once", async () => {
    const { code, creatorToken, joinedAt } = await countingRoom();
    wait(50);
    const results = await Promise.all([extend(code, creatorToken), extend(code, creatorToken)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await countdownOf(code, creatorToken)).toMatchObject({ endsAt: later(joinedAt, 120), extensions: 1 });
  });

  it("is refused without a countdown, after the start, and with a wrong token", async () => {
    const room = await newRoom();
    expect(await extend(room.code, room.creatorToken)).toMatchObject({ status: 409, body: { error: "no-countdown" } });

    const { code, creatorToken } = await countingRoom();
    expect(await extend(code, "f".repeat(64))).toMatchObject({ status: 403, body: { error: "wrong-token" } });
    wait(60);
    expect(await extend(code, creatorToken)).toMatchObject({ status: 409, body: { error: "room-started" } });
  });
});
