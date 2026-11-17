import { beforeEach, describe, expect, it } from "vitest";
import { createNewRoom, getRoomState, joinRoom, playerLeavesRoom, startRoomGame } from "@/lib/api/rooms";
import type { TransactionDb } from "@/lib/db/client";
import { DEFAULT_ROOM_SETTINGS } from "@/lib/game/room-settings";
import { loggedInSession } from "../helpers/session";
import { addTestSongs } from "../helpers/songs";
import { createTestDb } from "../helpers/test-db";

// The duel layout (issue #39) is shown for a game that STARTED with 2 players. Players can leave during the game,
// so the page cannot count the players it sees now: the room state says how many players the game started with.
let db: TransactionDb;
let clock: Date;
let nextCode: number;
let session: string;
const deps = { now: () => clock };
const START = new Date("2026-11-15T12:00:00.000Z");

beforeEach(async () => {
  db = await createTestDb();
  await addTestSongs(db, 8);
  clock = START;
  nextCode = 482913;
  session = await loggedInSession(db, START);
});

const bearer = (token: string) => `Bearer ${token}`;
const state = (code: string, token: string) => getRoomState(db, code, bearer(token), deps);

async function lobby(type: "duel" | "multiplayer", ...nicknames: string[]) {
  const created = await createNewRoom(
    db,
    session,
    JSON.stringify({ nickname: nicknames[0], settings: { ...DEFAULT_ROOM_SETTINGS, type } }),
    { ...deps, newCode: () => String(nextCode++) },
  );
  if (created.status !== 201) throw new Error("Test setup: the room was not created");
  const { code, playerToken } = created.body as { code: string; playerToken: string };
  const tokens = [playerToken];
  for (const nickname of nicknames.slice(1)) {
    clock = new Date(clock.getTime() + 1);
    const result = await joinRoom(db, code, JSON.stringify({ nickname }), deps);
    if (result.status !== 201) throw new Error(`Test setup: ${nickname} could not join`);
    tokens.push((result.body as { playerToken: string }).playerToken);
  }
  return { code, tokens };
}

async function startedMultiplayer(...nicknames: string[]) {
  const room = await lobby("multiplayer", ...nicknames);
  if ((await startRoomGame(db, room.code, bearer(room.tokens[0]), deps)).status !== 200) throw new Error("no start");
  return room;
}

describe("startingPlayers in the room state", () => {
  it("is null in the lobby", async () => {
    const { code, tokens } = await lobby("multiplayer", "Anna", "Ben");
    expect((await state(code, tokens[0])).body.startingPlayers).toBeNull();
  });

  it("is 2 for a Multiplayer game started with 2 players, and 3 for one started with 3", async () => {
    const two = await startedMultiplayer("Anna", "Ben");
    expect((await state(two.code, two.tokens[1])).body.startingPlayers).toBe(2);
    const three = await startedMultiplayer("Cleo", "Dan", "Eva");
    expect((await state(three.code, three.tokens[2])).body.startingPlayers).toBe(3);
  });

  it("is 2 for a Duel, which starts by itself when the second player joins", async () => {
    const { code, tokens } = await lobby("duel", "Anna", "Ben");
    expect((await state(code, tokens[0])).body).toMatchObject({ status: "playing", startingPlayers: 2 });
  });

  it("stays the number the game started with when a player leaves during the game", async () => {
    const { code, tokens } = await startedMultiplayer("Anna", "Ben", "Cleo");
    expect((await playerLeavesRoom(db, code, bearer(tokens[2]), deps)).status).toBe(200);
    expect((await state(code, tokens[0])).body).toMatchObject({ players: ["Anna", "Ben"], startingPlayers: 3 });
  });

  it("does not count players who left the lobby before the start", async () => {
    const { code, tokens } = await lobby("multiplayer", "Anna", "Ben", "Cleo");
    expect((await playerLeavesRoom(db, code, bearer(tokens[2]), deps)).status).toBe(200);
    expect((await startRoomGame(db, code, bearer(tokens[0]), deps)).status).toBe(200);
    expect((await state(code, tokens[1])).body.startingPlayers).toBe(2);
  });
});
