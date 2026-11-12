import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { TransactionDb } from "@/lib/db/client";
import { createGame, getGameRounds, markRoundSent } from "@/lib/db/games";
import {
  addPlayer,
  closeRoomRound,
  createRoom,
  findPlayerByToken,
  findRoomByHostToken,
  finishRoom,
  getRoomByCode,
  hashToken,
  isRoomGame,
  listPlayers,
  listRoomAnswers,
  MAX_PLAYERS,
  saveRoomAnswer,
  startRoom,
  type Room,
} from "@/lib/db/rooms";
import { applySchema } from "@/lib/db/schema";
import type { Song } from "@/lib/db/songs";
import { addTestSongs } from "../helpers/songs";
import { createTestDb } from "../helpers/test-db";

let db: TransactionDb;
let songs: Song[];

const NOW = new Date("2026-11-12T12:00:00.000Z");
const LATER = new Date("2026-11-12T12:00:05.000Z");
const HOST_TOKEN = "host-token-for-tests";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const HASH = "a".repeat(64); // looks like a SHA-256 hash, for the plain SQL tests

// A different moment for every join, so the join order is always clear.
let joinCount = 0;
const nextJoinTime = () => new Date(NOW.getTime() + ++joinCount * 1000);

beforeEach(async () => {
  db = await createTestDb();
  songs = await addTestSongs(db, 6);
  joinCount = 0;
});

async function newRoom(code = "482913", hostToken = HOST_TOKEN): Promise<Room> {
  const room = await createRoom(db, { code, hostToken, now: NOW });
  if (room === null) throw new Error(`Test setup: code ${code} is already taken`);
  return room;
}

async function join(roomId: string, nickname: string, token = `token-of-${nickname}`) {
  return addPlayer(db, { roomId, nickname, token, now: nextJoinTime() });
}

// Joins and returns the player. Fails the test if the join was rejected.
async function joined(roomId: string, nickname: string, token?: string) {
  const result = await join(roomId, nickname, token);
  if (!result.ok) throw new Error(`Test setup: ${nickname} could not join (${result.reason})`);
  return result.player;
}

function newGame() {
  return createGame(
    db,
    songs.slice(0, 5).map((song, i) => ({
      roundNumber: i + 1,
      songId: song.id,
      options: [song.title, "Wrong A", "Wrong B", "Wrong C"],
      correctOption: 0,
    })),
  );
}

// A started room with two players and round 1 open.
async function playingRoom(code = "482913") {
  const room = await newRoom(code, `host-of-${code}`);
  const anna = await joined(room.id, "Anna", `anna-${code}`);
  const ben = await joined(room.id, "Ben", `ben-${code}`);
  const gameId = await newGame();
  await startRoom(db, room.id, gameId);
  await markRoundSent(db, gameId, 1, NOW);
  return { room, anna, ben, gameId };
}

const answer = (gameId: string, playerId: string, roundNumber = 1) => ({
  gameId,
  roundNumber,
  playerId,
  chosenOption: 2,
  points: 130,
  answeredAt: LATER,
});

// ---------------------------------------------------------------------------------------------
// Plain SQL on purpose: these check the rules of the tables themselves, independent of lib/db/.
// ---------------------------------------------------------------------------------------------
describe("db/schema.sql – room tables", () => {
  const insertRoom = (code: string, status = "lobby", hash = HASH) =>
    db.query<{ id: string }>(
      "INSERT INTO rooms (code, host_token_hash, status) VALUES ($1, $2, $3) RETURNING id",
      [code, hash, status],
    );
  const insertPlayer = (roomId: string, nickname: string, hash = HASH) =>
    db.query<{ id: string }>(
      "INSERT INTO room_players (room_id, nickname, token_hash) VALUES ($1, $2, $3) RETURNING id",
      [roomId, nickname, hash],
    );
  const insertAnswer = (gameId: string, playerId: string, option = 1, points = 100) =>
    db.query(
      `INSERT INTO room_answers (game_id, round_number, player_id, chosen_option, points, answered_at)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [gameId, playerId, option, points, NOW.toISOString()],
    );

  it("accepts a 6-digit code and rejects every other shape", async () => {
    await expect(insertRoom("482913")).resolves.toHaveLength(1);
    await expect(insertRoom("48291")).rejects.toThrow(); // 5 digits
    await expect(insertRoom("4829131")).rejects.toThrow(); // 7 digits
    await expect(insertRoom("082913")).rejects.toThrow(); // starts with 0
    await expect(insertRoom("48a913")).rejects.toThrow(); // letter
  });

  it("rejects the same code twice", async () => {
    await insertRoom("482913");
    await expect(insertRoom("482913")).rejects.toThrow();
  });

  it("rejects an unknown status", async () => {
    await expect(insertRoom("482913", "paused")).rejects.toThrow();
  });

  it("accepts nicknames of 1 and 20 characters and rejects 0 and 21", async () => {
    const [room] = await insertRoom("482913");
    await expect(insertPlayer(room.id, "A")).resolves.toHaveLength(1);
    await expect(insertPlayer(room.id, "B".repeat(20))).resolves.toHaveLength(1);
    await expect(insertPlayer(room.id, "")).rejects.toThrow();
    await expect(insertPlayer(room.id, "C".repeat(21))).rejects.toThrow();
  });

  it("rejects the same nickname in a room in a different case, but allows it in another room", async () => {
    const [room] = await insertRoom("482913");
    const [other] = await insertRoom("482914");
    await insertPlayer(room.id, "Anna");
    await expect(insertPlayer(room.id, "anna")).rejects.toThrow();
    await expect(insertPlayer(room.id, "ANNA")).rejects.toThrow();
    await expect(insertPlayer(other.id, "anna")).resolves.toHaveLength(1);
  });

  it("treats non-English letters the same way (Ægir = ægir)", async () => {
    const [room] = await insertRoom("482913");
    await insertPlayer(room.id, "Ægir");
    await expect(insertPlayer(room.id, "ægir")).rejects.toThrow();
  });

  it("rejects a token hash that is not 64 hex characters", async () => {
    await expect(insertRoom("482913", "lobby", "plain-token")).rejects.toThrow();
    await expect(insertRoom("482913", "lobby", "A".repeat(64))).rejects.toThrow(); // upper case
    const [room] = await insertRoom("482913");
    await expect(insertPlayer(room.id, "Anna", "plain-token")).rejects.toThrow();
    await expect(insertPlayer(room.id, "Anna", "a".repeat(63))).rejects.toThrow();
  });

  it("deletes the players and their answers when a room is deleted", async () => {
    const { room, anna, gameId } = await playingRoom();
    await insertAnswer(gameId, anna.id);

    await db.query("DELETE FROM rooms WHERE id = $1", [room.id]);

    expect(await db.query("SELECT id FROM room_players")).toEqual([]);
    expect(await db.query("SELECT player_id FROM room_answers")).toEqual([]);
  });

  it("rejects a second answer by the same player for the same round", async () => {
    const { anna, gameId } = await playingRoom();
    await insertAnswer(gameId, anna.id);
    await expect(insertAnswer(gameId, anna.id)).rejects.toThrow();
  });

  it("rejects options outside 0–3 and negative points", async () => {
    const { anna, gameId } = await playingRoom();
    await expect(insertAnswer(gameId, anna.id, 4)).rejects.toThrow();
    await expect(insertAnswer(gameId, anna.id, -1)).rejects.toThrow();
    await expect(insertAnswer(gameId, anna.id, 1, -5)).rejects.toThrow();
    await expect(insertAnswer(gameId, anna.id, 3, 0)).resolves.toBeDefined();
  });

  it("can be applied a second time without an error", async () => {
    await newRoom();
    await expect(applySchema(db)).resolves.toBeUndefined();
    expect(await getRoomByCode(db, "482913")).not.toBeNull();
  });
});

describe("createRoom and lookups", () => {
  it("creates a lobby room without a game and never returns the hash", async () => {
    const room = await newRoom();
    expect(room).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      code: "482913",
      status: "lobby",
      gameId: null,
      createdAt: NOW,
    });
  });

  it("stores only the SHA-256 hash of the host token", async () => {
    await newRoom();
    const [row] = await db.query<Record<string, unknown>>("SELECT * FROM rooms");
    const expected = createHash("sha256").update(HOST_TOKEN).digest("hex");

    expect(hashToken(HOST_TOKEN)).toBe(expected);
    expect(row.host_token_hash).toBe(expected);
    expect(JSON.stringify(row)).not.toContain(HOST_TOKEN);
  });

  it("returns null when the code is already taken, and keeps the first room", async () => {
    const first = await newRoom("482913", "first-host");
    expect(await createRoom(db, { code: "482913", hostToken: "second-host", now: LATER })).toBeNull();
    expect(await findRoomByHostToken(db, "482913", "first-host")).toEqual(first);
    expect(await findRoomByHostToken(db, "482913", "second-host")).toBeNull();
  });

  it("getRoomByCode finds a room and returns null for an unknown code", async () => {
    const room = await newRoom();
    expect(await getRoomByCode(db, "482913")).toEqual(room);
    expect(await getRoomByCode(db, "999999")).toBeNull();
  });

  it("findRoomByHostToken only accepts this room's host token", async () => {
    const room = await newRoom("482913", "host-a");
    await newRoom("482914", "host-b");
    await joined(room.id, "Anna", "anna-token");

    expect(await findRoomByHostToken(db, "482913", "host-a")).toEqual(room);
    expect(await findRoomByHostToken(db, "482913", "wrong")).toBeNull();
    expect(await findRoomByHostToken(db, "482913", "anna-token")).toBeNull(); // a player is not the host
    expect(await findRoomByHostToken(db, "482913", "host-b")).toBeNull(); // host of another room
    expect(await findRoomByHostToken(db, "999999", "host-a")).toBeNull();
  });
});

describe("addPlayer", () => {
  it("adds a player, stores only the token hash and lists players in join order", async () => {
    const room = await newRoom();
    const result = await addPlayer(db, { roomId: room.id, nickname: "Anna", token: "anna-token", now: LATER });

    expect(result).toEqual({
      ok: true,
      player: { id: expect.any(String), roomId: room.id, nickname: "Anna", joinedAt: LATER },
    });
    const [row] = await db.query<Record<string, unknown>>("SELECT * FROM room_players");
    expect(row.token_hash).toBe(hashToken("anna-token"));
    expect(JSON.stringify(row)).not.toContain("anna-token");

    await joined(room.id, "Zoe");
    await joined(room.id, "Ben");
    expect((await listPlayers(db, room.id)).map((p) => p.nickname)).toEqual(["Zoe", "Ben", "Anna"]);
  });

  it("returns an empty list for a room without players", async () => {
    const room = await newRoom();
    expect(await listPlayers(db, room.id)).toEqual([]);
  });

  it("rejects a nickname that is taken in a different case, and keeps the first player", async () => {
    const room = await newRoom();
    await joined(room.id, "Anna");

    expect(await join(room.id, "anna", "other-token")).toEqual({ ok: false, reason: "nickname_taken" });
    expect((await listPlayers(db, room.id)).map((p) => p.nickname)).toEqual(["Anna"]);
  });

  it("allows the same nickname in two different rooms", async () => {
    const a = await newRoom("482913");
    const b = await newRoom("482914");
    expect((await join(a.id, "Anna", "t1")).ok).toBe(true);
    expect((await join(b.id, "Anna", "t2")).ok).toBe(true);
  });

  it("rejects joining once the room is playing or finished", async () => {
    const room = await newRoom();
    await joined(room.id, "Anna");
    await startRoom(db, room.id, await newGame());
    expect(await join(room.id, "Late")).toEqual({ ok: false, reason: "not_in_lobby" });

    await finishRoom(db, room.id);
    expect(await join(room.id, "Later")).toEqual({ ok: false, reason: "not_in_lobby" });
    expect((await listPlayers(db, room.id)).map((p) => p.nickname)).toEqual(["Anna"]);
  });

  it("rejects an unknown room", async () => {
    expect(await join(UNKNOWN_ID, "Anna")).toEqual({ ok: false, reason: "room_not_found" });
  });

  it("lets the 50th player in and rejects the 51st", async () => {
    const room = await newRoom();
    for (let i = 1; i <= MAX_PLAYERS - 1; i++) await joined(room.id, `Player ${i}`);

    expect((await join(room.id, "Player 50")).ok).toBe(true);
    expect(await join(room.id, "Player 51")).toEqual({ ok: false, reason: "room_full" });
    expect(await listPlayers(db, room.id)).toHaveLength(50);
  });

  it("lets exactly 50 in when 60 join at the same moment", async () => {
    const room = await newRoom();
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => join(room.id, `Player ${i + 1}`)),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(50);
    expect(results.filter((r) => !r.ok && r.reason === "room_full")).toHaveLength(10);
    expect(await listPlayers(db, room.id)).toHaveLength(50);
  });

  it("lets exactly 1 in when 3 join at the same moment and one seat is left", async () => {
    const room = await newRoom();
    for (let i = 1; i <= MAX_PLAYERS - 1; i++) await joined(room.id, `Player ${i}`);

    const results = await Promise.all(["X", "Y", "Z"].map((name) => join(room.id, name)));

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await listPlayers(db, room.id)).toHaveLength(50);
  });

  it("lets one in when the same nickname joins twice at the same moment", async () => {
    const room = await newRoom();
    const results = await Promise.all([join(room.id, "Anna", "t1"), join(room.id, "ANNA", "t2")]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "nickname_taken")).toHaveLength(1);
    expect(await listPlayers(db, room.id)).toHaveLength(1);
  });

  it("findPlayerByToken only accepts a token from this room", async () => {
    const room = await newRoom("482913");
    const other = await newRoom("482914");
    const anna = await joined(room.id, "Anna", "anna-token");
    await joined(other.id, "Ben", "ben-token");

    expect(await findPlayerByToken(db, room.id, "anna-token")).toEqual(anna);
    expect(await findPlayerByToken(db, room.id, "wrong")).toBeNull();
    expect(await findPlayerByToken(db, room.id, "ben-token")).toBeNull(); // token from another room
    expect(await findPlayerByToken(db, room.id, HOST_TOKEN)).toBeNull(); // the host is not a player
  });
});

describe("startRoom / finishRoom / isRoomGame", () => {
  it("starts a lobby room once and keeps the first game on a second start", async () => {
    const room = await newRoom();
    const gameA = await newGame();
    const gameB = await newGame();

    expect(await startRoom(db, room.id, gameA)).toBe(true);
    expect(await startRoom(db, room.id, gameB)).toBe(false);
    expect(await getRoomByCode(db, room.code)).toEqual({ ...room, status: "playing", gameId: gameA });
  });

  it("lets only one of two starts at the same moment succeed", async () => {
    const room = await newRoom();
    const gameA = await newGame();
    const gameB = await newGame();

    const results = await Promise.all([startRoom(db, room.id, gameA), startRoom(db, room.id, gameB)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? gameA : gameB;
    expect((await getRoomByCode(db, room.code))!.gameId).toBe(winner);
  });

  it("returns false when starting an unknown room", async () => {
    expect(await startRoom(db, UNKNOWN_ID, await newGame())).toBe(false);
  });

  it("finishes only a playing room, and only once", async () => {
    const room = await newRoom();
    expect(await finishRoom(db, room.id)).toBe(false); // still in the lobby

    await startRoom(db, room.id, await newGame());
    expect(await finishRoom(db, room.id)).toBe(true);
    expect(await finishRoom(db, room.id)).toBe(false);
    expect((await getRoomByCode(db, room.code))!.status).toBe("finished");
  });

  it("isRoomGame is true only for a game that belongs to a room", async () => {
    const room = await newRoom();
    const roomGame = await newGame();
    const soloGame = await newGame();
    await startRoom(db, room.id, roomGame);

    expect(await isRoomGame(db, roomGame)).toBe(true);
    expect(await isRoomGame(db, soloGame)).toBe(false);
    expect(await isRoomGame(db, UNKNOWN_ID)).toBe(false);
  });
});

describe("saveRoomAnswer / listRoomAnswers", () => {
  it("stores an answer on the open round and leaves the round's own answer columns empty", async () => {
    const { anna, gameId } = await playingRoom();

    expect(await saveRoomAnswer(db, answer(gameId, anna.id))).toBe(true);

    expect(await listRoomAnswers(db, gameId)).toEqual([
      { roundNumber: 1, playerId: anna.id, chosenOption: 2, points: 130, answeredAt: LATER },
    ]);
    const round = (await getGameRounds(db, gameId))![0];
    expect(round.status).toBe("open");
    expect(round.chosenOption).toBeNull();
    expect(round.points).toBeNull();
  });

  it("rejects a second answer by the same player and keeps the first", async () => {
    const { anna, gameId } = await playingRoom();
    await saveRoomAnswer(db, answer(gameId, anna.id));

    expect(await saveRoomAnswer(db, { ...answer(gameId, anna.id), chosenOption: 0, points: 150 })).toBe(false);
    expect(await listRoomAnswers(db, gameId)).toEqual([
      { roundNumber: 1, playerId: anna.id, chosenOption: 2, points: 130, answeredAt: LATER },
    ]);
  });

  it("counts once when the same player answers twice at the same moment", async () => {
    const { anna, gameId } = await playingRoom();
    const results = await Promise.all([
      saveRoomAnswer(db, answer(gameId, anna.id)),
      saveRoomAnswer(db, answer(gameId, anna.id)),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await listRoomAnswers(db, gameId)).toHaveLength(1);
  });

  it("counts both when two different players answer at the same moment", async () => {
    const { anna, ben, gameId } = await playingRoom();
    const results = await Promise.all([
      saveRoomAnswer(db, answer(gameId, anna.id)),
      saveRoomAnswer(db, answer(gameId, ben.id)),
    ]);

    expect(results).toEqual([true, true]);
    expect(await listRoomAnswers(db, gameId)).toHaveLength(2);
  });

  it("rejects an answer when the round is waiting, closed or does not exist", async () => {
    const { anna, ben, gameId } = await playingRoom();

    expect(await saveRoomAnswer(db, answer(gameId, anna.id, 2))).toBe(false); // round 2 is still waiting
    expect(await saveRoomAnswer(db, answer(gameId, anna.id, 6))).toBe(false); // there is no round 6

    await closeRoomRound(db, gameId, 1, LATER);
    expect(await saveRoomAnswer(db, answer(gameId, ben.id, 1))).toBe(false); // round 1 has closed
    expect(await listRoomAnswers(db, gameId)).toEqual([]);
  });

  it("rejects an answer from a player of another room and from an unknown player", async () => {
    const { gameId } = await playingRoom("482913");
    const other = await playingRoom("482914");

    expect(await saveRoomAnswer(db, answer(gameId, other.anna.id))).toBe(false);
    expect(await saveRoomAnswer(db, answer(gameId, UNKNOWN_ID))).toBe(false);
    expect(await listRoomAnswers(db, gameId)).toEqual([]);
  });

  it("lists all answers of a game by round, and nothing for a game without answers", async () => {
    const { anna, ben, gameId } = await playingRoom();
    expect(await listRoomAnswers(db, gameId)).toEqual([]);

    await saveRoomAnswer(db, answer(gameId, ben.id));
    await closeRoomRound(db, gameId, 1, LATER);
    await markRoundSent(db, gameId, 2, LATER);
    await saveRoomAnswer(db, { ...answer(gameId, anna.id, 2), points: 0, chosenOption: 3 });

    const answers = await listRoomAnswers(db, gameId);
    expect(answers.map((a) => [a.roundNumber, a.playerId, a.points])).toEqual([
      [1, ben.id, 130],
      [2, anna.id, 0],
    ]);
  });
});

describe("closeRoomRound", () => {
  it("closes an open round once and leaves chosen_option and points empty", async () => {
    const { gameId } = await playingRoom();

    expect(await closeRoomRound(db, gameId, 1, LATER)).toBe(true);
    expect(await closeRoomRound(db, gameId, 1, new Date("2026-11-12T13:00:00Z"))).toBe(false);

    const round = (await getGameRounds(db, gameId))![0];
    expect(round.status).toBe("answered");
    expect(round.answeredAt).toEqual(LATER);
    expect(round.chosenOption).toBeNull();
    expect(round.points).toBeNull();
  });

  it("does nothing on a waiting round", async () => {
    const { gameId } = await playingRoom();
    expect(await closeRoomRound(db, gameId, 2, LATER)).toBe(false);
    expect((await getGameRounds(db, gameId))![1].status).toBe("waiting");
  });

  it("lets only one of two closes at the same moment succeed", async () => {
    const { gameId } = await playingRoom();
    const results = await Promise.all([
      closeRoomRound(db, gameId, 1, LATER),
      closeRoomRound(db, gameId, 1, LATER),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("never touches a solo game", async () => {
    const soloGame = await newGame();
    await markRoundSent(db, soloGame, 1, NOW);

    expect(await closeRoomRound(db, soloGame, 1, LATER)).toBe(false);
    expect((await getGameRounds(db, soloGame))![0].status).toBe("open");
  });
});
