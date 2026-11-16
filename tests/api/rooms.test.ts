import { beforeEach, describe, expect, it } from "vitest";
import {
  answerRoomRound,
  createNewRoom,
  getRoomState,
  joinRoom,
  openNextRound,
  replaceRoomSong,
  startRoomGame,
} from "@/lib/api/rooms";
import type { TransactionDb } from "@/lib/db/client";
import { getGameRounds } from "@/lib/db/games";
import { hashToken, listRoomAnswers } from "@/lib/db/rooms";
import { MUSIC_UNAVAILABLE_MESSAGE } from "@/lib/music/itunes";
import { loggedInSession } from "../helpers/session";
import { addTestSongs } from "../helpers/songs";
import { createTestDb } from "../helpers/test-db";

// Full requests from start to finish, against PGlite. No network. The clock only moves when a test moves it.
// The room creator plays (issue #32): in these tests the first nickname of a room is its creator.
let db: TransactionDb;
let clock: Date;
let nextCode: number;
let session: string; // the session cookie of a logged-in account holder
const deps = { now: () => clock };
const START = new Date("2026-11-15T12:00:00.000Z");
const MINUTES = 60;
const HOURS = 60 * 60;

// Moves the clock forward.
function wait(seconds: number) {
  clock = new Date(clock.getTime() + seconds * 1000);
}

beforeEach(async () => {
  db = await createTestDb();
  await addTestSongs(db, 8);
  clock = START;
  nextCode = 482913;
  session = await loggedInSession(db, START);
});

type Reply = { status: number; body: Record<string, unknown> };
type RoomKeys = { code: string; creatorToken: string };

// What the browser sends in the Authorization header.
const bearer = (token: string | null) => (token === null ? null : `Bearer ${token}`);
const json = (body: unknown) => (typeof body === "string" ? body : JSON.stringify(body));

const create = (sessionToken: string | undefined, body: unknown, extra = {}) =>
  createNewRoom(db, sessionToken, json(body), { ...deps, ...extra });
const join = (code: string, nickname: unknown) => joinRoom(db, code, json({ nickname }), deps);
const start = (code: string, token: string | null) => startRoomGame(db, code, bearer(token), deps);
const next = (code: string, token: string | null) => openNextRound(db, code, bearer(token), deps);
const answer = (code: string, token: string | null, body: unknown) =>
  answerRoomRound(db, code, bearer(token), json(body), deps);
const state = (code: string, token: string | null) => getRoomState(db, code, bearer(token), deps);
const replace = (code: string, token: string | null, body: unknown) =>
  replaceRoomSong(db, code, bearer(token), json(body), deps);

// Test rooms get the codes 482913, 482914, ... so that no test depends on luck.
async function newRoom(creator = "Anna"): Promise<RoomKeys> {
  const result = await create(session, { nickname: creator }, { newCode: () => String(nextCode++) });
  if (result.status !== 201) throw new Error("Test setup: the room was not created");
  const { code, playerToken } = result.body as { code: string; playerToken: string };
  return { code, creatorToken: playerToken };
}

// Joins and returns the player token. Fails the test if the join was rejected.
// The clock moves 1 millisecond first, so every player joins at a different moment and the join order is clear.
async function joined(code: string, nickname: string): Promise<string> {
  wait(0.001);
  const result = await join(code, nickname);
  if (result.status !== 201) throw new Error(`Test setup: ${nickname} could not join`);
  return (result.body as { playerToken: string }).playerToken;
}

// A started room. The first nickname creates the room, the others join. tokens[0] is the creator's token.
async function startedRoom(creator: string, ...others: string[]) {
  const room = await newRoom(creator);
  const tokens = [room.creatorToken];
  for (const nickname of others) tokens.push(await joined(room.code, nickname));
  const result = await start(room.code, room.creatorToken);
  if (result.status !== 200) throw new Error("Test setup: the game did not start");
  return { ...room, tokens };
}

async function gameIdOf(code: string): Promise<string> {
  const rows = await db.query<{ game_id: string }>("SELECT game_id FROM rooms WHERE code = $1", [code]);
  return rows[0].game_id;
}

async function roundsOf(code: string) {
  return (await getGameRounds(db, await gameIdOf(code)))!;
}

// The room creator taps Next. Returns the round number with one right and one wrong option (read from the database).
async function openRound(room: RoomKeys) {
  const result = await next(room.code, room.creatorToken);
  if (result.status !== 200) throw new Error("Test setup: the round did not open");
  const number = (result.body as { round: number }).round;
  const right = (await roundsOf(room.code))[number - 1].correctOption;
  return { number, right, wrong: (right + 1) % 4 };
}

const statusOf = async (code: string) =>
  (await db.query<{ status: string }>("SELECT status FROM rooms WHERE code = $1", [code]))[0].status;

const playersOf = async (code: string, token: string) => (await state(code, token)).body.players;

describe("POST /api/rooms – create a room", () => {
  it("returns 201 with a 6-digit code and the creator's player token, and nothing else", async () => {
    const result = await create(session, { nickname: "  Anna  " });

    expect(result.status).toBe(201);
    expect(Object.keys(result.body).sort()).toEqual(["code", "nickname", "playerToken"]);
    const { code, playerToken, nickname } = result.body as { code: string; playerToken: string; nickname: string };
    expect(code).toMatch(/^[1-9][0-9]{5}$/);
    expect(playerToken).toMatch(/^[0-9a-f]{64}$/);
    expect(nickname).toBe("Anna");
    expect(await statusOf(code)).toBe("lobby");
  });

  it("puts the room creator in the lobby as a player", async () => {
    const room = await newRoom("Anna");

    expect((await state(room.code, room.creatorToken)).body).toMatchObject({
      status: "lobby",
      role: "creator",
      players: ["Anna"],
      me: { nickname: "Anna", score: 0, rank: 1 },
    });
  });

  it("stores only the hash of the creator's token", async () => {
    const { creatorToken } = await newRoom();

    const rows = await db.query<{ host_token_hash: string }>("SELECT host_token_hash FROM rooms");
    expect(rows[0].host_token_hash).toBe(hashToken(creatorToken));
    const everything = JSON.stringify([await db.query("SELECT * FROM rooms"), await db.query("SELECT * FROM room_players")]);
    expect(everything).not.toContain(creatorToken);
  });

  it("refuses a guest, an unknown session and an expired session with 401, and creates no room", async () => {
    for (const cookie of [undefined, "", "not-a-session", "x".repeat(500)]) {
      expect(await create(cookie, { nickname: "Anna" })).toEqual({
        status: 401,
        body: { error: "log-in-needed", message: "Please log in to create a room." },
      });
    }
    wait(24 * HOURS); // the test session lasts one day
    expect(await create(session, { nickname: "Anna" })).toMatchObject({ status: 401, body: { error: "log-in-needed" } });
    expect(await db.query("SELECT id FROM rooms")).toEqual([]);
  });

  it("refuses a body that is not valid and an invalid nickname, and creates no room", async () => {
    for (const body of ["not json", "", "[]", '"Anna"', `{"nickname":"${"a".repeat(2000)}"}`]) {
      expect(await create(session, body)).toMatchObject({ status: 400, body: { error: "malformed" } });
    }
    for (const nickname of ["", "   ", "a".repeat(21), "An\nna", 42, null, undefined]) {
      expect(await create(session, { nickname })).toMatchObject({ status: 400, body: { error: "invalid-nickname" } });
    }
    expect(await db.query("SELECT id FROM rooms")).toEqual([]);
  });

  it("gives every room its own code and token", async () => {
    const a = await newRoom();
    const b = await newRoom();
    expect(a.code).not.toBe(b.code);
    expect(a.creatorToken).not.toBe(b.creatorToken);
  });

  it("draws another code when the first one is taken", async () => {
    const first = await newRoom();
    const draws = [first.code, first.code, "593024"];

    const result = await create(session, { nickname: "Ben" }, { newCode: () => draws.shift()! });

    expect(result).toMatchObject({ status: 201, body: { code: "593024" } });
    expect(await playersOf(first.code, first.creatorToken)).toEqual(["Anna"]);
  });

  it("gives up with a 500 after 10 taken codes in a row", async () => {
    const first = await newRoom();
    let draws = 0;

    const result = await create(session, { nickname: "Ben" }, {
      newCode: () => {
        draws++;
        return first.code;
      },
    });

    expect(result).toMatchObject({ status: 500, body: { error: "server-error" } });
    expect(draws).toBe(10);
    expect(await db.query("SELECT id FROM rooms")).toHaveLength(1);
    expect(await db.query("SELECT id FROM room_players")).toHaveLength(1);
  });
});

describe("POST /api/rooms/[code]/join", () => {
  it("returns 201 with a player token and the trimmed nickname, and both lobbies show both players", async () => {
    const room = await newRoom("Anna");
    wait(0.001);

    const result = await join(room.code, "  Ben  ");

    expect(result.status).toBe(201);
    expect(Object.keys(result.body).sort()).toEqual(["nickname", "playerToken"]);
    expect(result.body.nickname).toBe("Ben");
    const ben = result.body.playerToken as string;
    expect(ben).toMatch(/^[0-9a-f]{64}$/);
    expect(await playersOf(room.code, room.creatorToken)).toEqual(["Anna", "Ben"]);
    expect(await playersOf(room.code, ben)).toEqual(["Anna", "Ben"]);
  });

  it("stores only the hash of the player token", async () => {
    const room = await newRoom("Anna");
    const token = await joined(room.code, "Ben");

    const rows = await db.query<{ token_hash: string }>("SELECT token_hash FROM room_players WHERE nickname = 'Ben'");
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(JSON.stringify(await db.query("SELECT * FROM room_players"))).not.toContain(token);
  });

  it("rejects a body that is not valid", async () => {
    const room = await newRoom();
    for (const body of ["not json", "", "[]", '"Anna"', `{"nickname":"${"a".repeat(2000)}"}`]) {
      const result = await joinRoom(db, room.code, body, deps);
      expect(result).toMatchObject({ status: 400, body: { error: "malformed" } });
    }
  });

  it("rejects an invalid nickname", async () => {
    const room = await newRoom();
    for (const nickname of ["", "   ", "a".repeat(21), "An\nna", 42, null, undefined]) {
      const result = await join(room.code, nickname);
      expect(result).toMatchObject({ status: 400, body: { error: "invalid-nickname" } });
    }
    expect(await db.query("SELECT id FROM room_players")).toHaveLength(1); // only the creator
  });

  it("rejects an unknown code and a code of the wrong shape with 404", async () => {
    await newRoom();
    for (const code of ["999999", "12345", "abcdef", "082913", "1234567"]) {
      expect(await join(code, "Ben")).toMatchObject({ status: 404, body: { error: "room-not-found" } });
    }
  });

  it("rejects joining once the game has started or finished", async () => {
    const room = await startedRoom("Anna", "Ben");
    expect(await join(room.code, "Cleo")).toMatchObject({ status: 409, body: { error: "room-started" } });

    await db.query("UPDATE rooms SET status = 'finished' WHERE code = $1", [room.code]);
    expect(await join(room.code, "Cleo")).toMatchObject({ status: 409, body: { error: "room-started" } });
  });

  it("rejects a nickname that is taken in a different case – the creator's too", async () => {
    const room = await newRoom("Anna");
    await joined(room.code, "Ben");

    expect(await join(room.code, "BEN")).toMatchObject({ status: 409, body: { error: "nickname-taken" } });
    expect(await join(room.code, "anna")).toMatchObject({ status: 409, body: { error: "nickname-taken" } });
    expect(await playersOf(room.code, room.creatorToken)).toEqual(["Anna", "Ben"]);
  });

  it("lets the 25th player in (the creator counts) and rejects the 26th", async () => {
    const room = await newRoom();
    for (let i = 2; i <= 24; i++) await joined(room.code, `Player ${i}`);

    expect((await join(room.code, "Player 25")).status).toBe(201);
    expect(await join(room.code, "Player 26")).toEqual({
      status: 409,
      body: { error: "room-full", message: "This room is full." },
    });
    expect(await playersOf(room.code, room.creatorToken)).toHaveLength(25);
  });

  it("works until just before 30 minutes in the lobby and is rejected from exactly 30 minutes on", async () => {
    const room = await newRoom();

    wait(30 * MINUTES - 0.001);
    expect((await join(room.code, "Ben")).status).toBe(201);

    wait(0.001);
    expect(await join(room.code, "Cleo")).toEqual({
      status: 409,
      body: { error: "room-closed", message: "This room has closed." },
    });
  });

  it("lets one in when the same nickname joins twice at the same moment", async () => {
    const room = await newRoom("Anna");

    const results = await Promise.all([join(room.code, "Ben"), join(room.code, "ben")]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe("nickname-taken");
    expect(await db.query("SELECT id FROM room_players")).toHaveLength(2);
  });

  it("lets exactly 24 in next to the creator when 25 join at the same moment", async () => {
    const room = await newRoom();

    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => join(room.code, `Player ${i + 1}`)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(24);
    const rejected = results.filter((r) => r.status !== 201);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ status: 409, body: { error: "room-full" } });
    expect(await db.query("SELECT id FROM room_players")).toHaveLength(25);
  });
});

describe("POST /api/rooms/[code]/start", () => {
  it("starts the game: 5 waiting rounds, the 5 clip addresses, no titles and no game ID", async () => {
    const room = await newRoom("Anna");
    await joined(room.code, "Ben");

    const result = await start(room.code, room.creatorToken);

    expect(result.status).toBe(200);
    expect(Object.keys(result.body).sort()).toEqual(["previewUrls", "totalRounds"]);
    expect(await statusOf(room.code)).toBe("playing");
    const rounds = await roundsOf(room.code);
    expect(rounds).toHaveLength(5);
    expect(rounds.every((r) => r.status === "waiting")).toBe(true);
    expect(result.body).toEqual({ totalRounds: 5, previewUrls: rounds.map((r) => r.song.previewUrl) });
    const text = JSON.stringify(result.body);
    expect(text).not.toContain(await gameIdOf(room.code));
    for (const round of rounds) expect(text).not.toContain(round.song.title);
  });

  it("rejects every token that is not this room's creator token – other players too – and stays in the lobby", async () => {
    const room = await newRoom("Anna");
    const other = await newRoom("Zoe");
    const playerToken = await joined(room.code, "Ben");

    for (const token of [null, "abc", "f".repeat(64), other.creatorToken, playerToken]) {
      expect(await start(room.code, token)).toMatchObject({ status: 403, body: { error: "wrong-token" } });
    }
    expect(await startRoomGame(db, room.code, room.creatorToken, deps)).toMatchObject({ status: 403 }); // no "Bearer "
    expect(await statusOf(room.code)).toBe("lobby");
    expect(await db.query("SELECT id FROM games")).toEqual([]);
  });

  it("rejects a start with only the room creator, and works once a second player has joined", async () => {
    const room = await newRoom("Anna");

    expect(await start(room.code, room.creatorToken)).toEqual({
      status: 409,
      body: { error: "not-enough-players", message: "At least 2 players are needed to start." },
    });
    expect(await statusOf(room.code)).toBe("lobby");
    expect(await db.query("SELECT id FROM games")).toEqual([]);

    await joined(room.code, "Ben");
    expect((await start(room.code, room.creatorToken)).status).toBe(200);
  });

  it("rejects a second start and keeps the first game", async () => {
    const room = await startedRoom("Anna", "Ben");
    const gameId = await gameIdOf(room.code);

    expect(await start(room.code, room.creatorToken)).toMatchObject({ status: 409, body: { error: "room-started" } });
    expect(await gameIdOf(room.code)).toBe(gameId);
  });

  it("lets only one of two starts at the same moment succeed", async () => {
    const room = await newRoom("Anna");
    await joined(room.code, "Ben");

    const results = await Promise.all([start(room.code, room.creatorToken), start(room.code, room.creatorToken)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe("room-started");
    expect(await statusOf(room.code)).toBe("playing");
  });

  it("returns 503 when fewer than 5 songs have a clip, and stays in the lobby", async () => {
    db = await createTestDb();
    await addTestSongs(db, 8, 4);
    session = await loggedInSession(db, START);
    const room = await newRoom("Anna");
    await joined(room.code, "Ben");

    expect(await start(room.code, room.creatorToken)).toEqual({
      status: 503,
      body: { error: "not-enough-songs", message: MUSIC_UNAVAILABLE_MESSAGE },
    });
    expect(await statusOf(room.code)).toBe("lobby");
  });

  it("rejects an unknown room, and a lobby from exactly 30 minutes on", async () => {
    const room = await newRoom("Anna");
    await joined(room.code, "Ben");

    expect(await start("999999", room.creatorToken)).toMatchObject({ status: 404, body: { error: "room-not-found" } });
    wait(30 * MINUTES);
    expect(await start(room.code, room.creatorToken)).toMatchObject({ status: 409, body: { error: "room-closed" } });
    expect(await statusOf(room.code)).toBe("lobby");
  });
});

describe("closing rules", () => {
  it("keeps a started room open after 30 minutes and closes it from exactly 3 hours on", async () => {
    const room = await newRoom("Anna");
    const ben = await joined(room.code, "Ben");
    wait(29 * MINUTES);
    await start(room.code, room.creatorToken);

    wait(1 * MINUTES); // 30 minutes after creation, but the game has started
    expect((await state(room.code, ben)).status).toBe(200);

    wait(3 * HOURS - 30 * MINUTES - 0.001 - 0.001); // just before 3 hours after creation
    expect((await state(room.code, ben)).status).toBe(200);

    wait(0.001);
    for (const token of [room.creatorToken, ben]) {
      expect(await state(room.code, token)).toEqual({
        status: 409,
        body: { error: "room-closed", message: "This room has closed." },
      });
    }
  });

  it("closes a lobby for everyone at 30 minutes – the state says 'This room has closed'", async () => {
    const room = await newRoom("Anna");
    const ben = await joined(room.code, "Ben");

    wait(30 * MINUTES - 0.001 - 0.001);
    expect((await state(room.code, ben)).status).toBe(200);

    wait(0.001);
    for (const token of [room.creatorToken, ben]) {
      expect(await state(room.code, token)).toMatchObject({ status: 409, body: { error: "room-closed" } });
    }
  });
});

describe("POST /api/rooms/[code]/next", () => {
  it("opens round 1, notes the time, and sends nothing that gives the answer away", async () => {
    const room = await startedRoom("Anna", "Ben");
    wait(20);

    const result = await next(room.code, room.creatorToken);

    const round = (await roundsOf(room.code))[0];
    expect(result).toEqual({
      status: 200,
      body: { round: 1, totalRounds: 5, previewUrl: round.song.previewUrl, options: round.options, secondsLeft: 15 },
    });
    expect(round.status).toBe("open");
    expect(round.startedAt).toEqual(clock);
  });

  it("is rejected in the lobby", async () => {
    const room = await newRoom("Anna");
    await joined(room.code, "Ben");
    expect(await next(room.code, room.creatorToken)).toMatchObject({ status: 409, body: { error: "not-started" } });
  });

  it("is rejected while the round is still open", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    await answer(room.code, room.tokens[0], { round: round.number, answer: round.right }); // Ben has not answered

    wait(15); // exactly 15 s: still open
    expect(await next(room.code, room.creatorToken)).toMatchObject({ status: 409, body: { error: "round-still-open" } });
    expect((await roundsOf(room.code))[1].status).toBe("waiting");
  });

  it("opens round 2 once every player – the creator included – has answered, without a state request in between", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    await answer(room.code, room.tokens[0], { round: 1, answer: round.right });
    await answer(room.code, room.tokens[1], { round: 1, answer: round.wrong });
    wait(4);

    expect(await next(room.code, room.creatorToken)).toMatchObject({ status: 200, body: { round: 2 } });
    const rounds = await roundsOf(room.code);
    expect(rounds[0].status).toBe("answered");
    expect(rounds[1].status).toBe("open");
  });

  it("opens round 2 after the 15 seconds are over, even if nobody answered", async () => {
    const room = await startedRoom("Anna", "Ben");
    await openRound(room);
    wait(15.001);

    expect(await next(room.code, room.creatorToken)).toMatchObject({ status: 200, body: { round: 2 } });
  });

  it("is rejected after the last round, and the room is finished", async () => {
    const room = await startedRoom("Anna", "Ben");
    for (let i = 1; i <= 5; i++) {
      const round = await openRound(room);
      for (const token of room.tokens) await answer(room.code, token, { round: round.number, answer: round.right });
    }

    expect(await next(room.code, room.creatorToken)).toMatchObject({ status: 409, body: { error: "game-finished" } });
    expect(await statusOf(room.code)).toBe("finished");
    expect(await next(room.code, room.creatorToken)).toMatchObject({ status: 409, body: { error: "game-finished" } });
  });

  it("rejects another player's token and another room's creator token", async () => {
    const room = await startedRoom("Anna", "Ben");
    const other = await newRoom("Zoe");

    for (const token of [null, room.tokens[1], other.creatorToken]) {
      expect(await next(room.code, token)).toMatchObject({ status: 403, body: { error: "wrong-token" } });
    }
    expect((await roundsOf(room.code))[0].status).toBe("waiting");
  });

  it("opens only one round when two requests arrive at the same moment", async () => {
    const room = await startedRoom("Anna", "Ben");

    const results = await Promise.all([next(room.code, room.creatorToken), next(room.code, room.creatorToken)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe("round-still-open");
    expect((await roundsOf(room.code)).map((r) => r.status)).toEqual(["open", "waiting", "waiting", "waiting", "waiting"]);
  });

  it("is rejected in a closed room", async () => {
    const room = await startedRoom("Anna", "Ben");
    wait(3 * HOURS);
    expect(await next(room.code, room.creatorToken)).toMatchObject({ status: 409, body: { error: "room-closed" } });
  });
});

describe("POST /api/rooms/[code]/answer", () => {
  it("accepts an answer and replies without right/wrong and without points", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    wait(3);

    const result = await answer(room.code, room.tokens[1], { round: 1, answer: round.right });

    expect(result).toEqual({ status: 200, body: { round: 1, answer: round.right } });
  });

  it("lets the room creator answer like every other player", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    wait(3);

    expect(await answer(room.code, room.creatorToken, { round: 1, answer: round.right })).toEqual({
      status: 200,
      body: { round: 1, answer: round.right },
    });
    expect((await listRoomAnswers(db, await gameIdOf(room.code))).map((a) => a.points)).toEqual([140]);
  });

  it("stores 140 points for a correct answer after 3 seconds and 0 for a wrong one", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    wait(3);
    await answer(room.code, room.tokens[0], { round: 1, answer: round.right });
    await answer(room.code, room.tokens[1], { round: 1, answer: round.wrong });

    const answers = await listRoomAnswers(db, await gameIdOf(room.code));
    expect(answers.map((a) => [a.chosenOption, a.points]).sort()).toEqual(
      [
        [round.right, 140],
        [round.wrong, 0],
      ].sort(),
    );
    expect(answers[0].answeredAt).toEqual(clock);
  });

  it("accepts an answer at exactly 15 seconds with 100 points and rejects one just after", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);

    wait(15);
    expect((await answer(room.code, room.tokens[0], { round: 1, answer: round.right })).status).toBe(200);

    wait(0.001);
    expect(await answer(room.code, room.tokens[1], { round: 1, answer: round.right })).toEqual({
      status: 409,
      body: { error: "too-late", message: "Too late – the time for this round is over." },
    });

    const answers = await listRoomAnswers(db, await gameIdOf(room.code));
    expect(answers.map((a) => a.points)).toEqual([100]);
  });

  it("rejects input that is not valid", async () => {
    const room = await startedRoom("Anna", "Ben");
    await openRound(room);
    const token = room.tokens[1];

    for (const option of [4, -1, 1.5]) {
      expect(await answer(room.code, token, { round: 1, answer: option })).toMatchObject({
        status: 400,
        body: { error: "invalid-option" },
      });
    }
    for (const body of ["not json", "", { round: 1, answer: "skip" }, { round: 1, answer: "2" }, { round: 0, answer: 0 }, { answer: 0 }, `{"round":1,"answer":0,"x":"${"a".repeat(2000)}"}`]) {
      expect(await answer(room.code, token, body)).toMatchObject({ status: 400, body: { error: "malformed" } });
    }
    expect(await answer(room.code, token, { round: 6, answer: 0 })).toMatchObject({
      status: 400,
      body: { error: "round-out-of-range" },
    });
    expect(await listRoomAnswers(db, await gameIdOf(room.code))).toEqual([]);
  });

  it("rejects a second answer and keeps the first", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    await answer(room.code, room.tokens[0], { round: 1, answer: round.right });

    expect(await answer(room.code, room.tokens[0], { round: 1, answer: round.wrong })).toMatchObject({
      status: 409,
      body: { error: "already-answered" },
    });
    const answers = await listRoomAnswers(db, await gameIdOf(room.code));
    expect(answers.map((a) => a.chosenOption)).toEqual([round.right]);
  });

  it("counts once when the same player answers twice at the same moment", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);

    const results = await Promise.all([
      answer(room.code, room.tokens[1], { round: 1, answer: round.right }),
      answer(room.code, room.tokens[1], { round: 1, answer: round.wrong }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe("already-answered");
    expect(await listRoomAnswers(db, await gameIdOf(room.code))).toHaveLength(1);
  });

  it("rejects an answer for a round that is not the open one", async () => {
    const room = await startedRoom("Anna", "Ben");
    const [anna, ben] = room.tokens;

    // Nothing is open yet.
    expect(await answer(room.code, anna, { round: 1, answer: 0 })).toMatchObject({ status: 409, body: { error: "round-not-open" } });

    // Round 1 closes after 15 s. Only Anna answered it.
    const first = await openRound(room);
    await answer(room.code, anna, { round: 1, answer: first.right });
    wait(16);
    await openRound(room); // round 2

    expect(await answer(room.code, anna, { round: 3, answer: 0 })).toMatchObject({ status: 409, body: { error: "round-not-open" } });
    expect(await answer(room.code, ben, { round: 1, answer: 0 })).toMatchObject({ status: 409, body: { error: "too-late" } });
    expect(await answer(room.code, anna, { round: 1, answer: 0 })).toMatchObject({ status: 409, body: { error: "already-answered" } });
    expect(await listRoomAnswers(db, await gameIdOf(room.code))).toHaveLength(1);
  });

  it("rejects a token from another room, an unknown token and a missing token", async () => {
    const room = await startedRoom("Anna", "Ben");
    const other = await startedRoom("Zoe", "Max");
    await openRound(room);
    await openRound(other);

    for (const token of [null, other.tokens[0], other.tokens[1], "f".repeat(64)]) {
      expect(await answer(room.code, token, { round: 1, answer: 0 })).toMatchObject({
        status: 403,
        body: { error: "wrong-token" },
      });
    }
    expect(await listRoomAnswers(db, await gameIdOf(room.code))).toEqual([]);
  });

  it("is rejected in the lobby and in a closed room", async () => {
    const room = await newRoom("Anna");
    const token = await joined(room.code, "Ben");
    expect(await answer(room.code, token, { round: 1, answer: 0 })).toMatchObject({ status: 409, body: { error: "not-started" } });

    wait(30 * MINUTES);
    expect(await answer(room.code, token, { round: 1, answer: 0 })).toMatchObject({ status: 409, body: { error: "room-closed" } });
  });
});

describe("GET /api/rooms/[code] – room state", () => {
  it("shows the lobby to the room creator, who is a player too", async () => {
    const room = await newRoom("Anna");
    await joined(room.code, "Ben");

    expect(await state(room.code, room.creatorToken)).toEqual({
      status: 200,
      body: {
        code: room.code,
        status: "lobby",
        role: "creator",
        players: ["Anna", "Ben"],
        totalRounds: 5,
        round: null,
        me: { nickname: "Anna", score: 0, rank: 1, answer: null, correct: null, points: null },
        previewUrls: null,
        scoreboard: [
          { rank: 1, nickname: "Anna", score: 0 },
          { rank: 1, nickname: "Ben", score: 0 },
        ],
      },
    });
  });

  it("shows the lobby to a player, and the same place again after a reload", async () => {
    const room = await newRoom("Anna");
    const ben = await joined(room.code, "Ben");

    const expected = {
      status: 200,
      body: {
        code: room.code,
        status: "lobby",
        role: "player",
        players: ["Anna", "Ben"],
        totalRounds: 5,
        round: null,
        me: { nickname: "Ben", score: 0, rank: 1, answer: null, correct: null, points: null },
      },
    };
    expect(await state(room.code, ben)).toEqual(expected);
    expect(await state(room.code, ben)).toEqual(expected);
  });

  it("after Start and before the first Next: no round yet, clip addresses only for the room creator", async () => {
    const room = await startedRoom("Anna", "Ben");

    const creator = (await state(room.code, room.creatorToken)).body;
    const player = (await state(room.code, room.tokens[1])).body;

    expect(creator).toMatchObject({ status: "playing", round: null, me: { nickname: "Anna" } });
    expect(creator.previewUrls).toEqual((await roundsOf(room.code)).map((r) => r.song.previewUrl));
    expect(player).toMatchObject({ status: "playing", round: null, me: { nickname: "Ben" } });
    expect(player).not.toHaveProperty("previewUrls");
    expect(player).not.toHaveProperty("scoreboard");
  });

  it("never contains the correct answer while a round is open – not for the creator, not for the other players", async () => {
    const room = await startedRoom("Anna", "Ben", "Cleo");
    const round = await openRound(room);
    wait(5.6);
    await answer(room.code, room.tokens[1], { round: 1, answer: round.right }); // Ben has answered, the others not

    const stored = (await roundsOf(room.code))[0];
    for (const token of room.tokens) {
      const body = (await state(room.code, token)).body;

      expect(body.round).toEqual({
        number: 1,
        status: "open",
        options: stored.options,
        secondsLeft: 9.4,
        answeredCount: 1,
      });
      const text = JSON.stringify(body);
      expect(text).not.toContain("correctOption");
      expect(text).not.toContain(stored.song.artist);
      expect(text).not.toContain(stored.song.artworkUrl);
    }
  });

  it("shows a player their own choice but no result and no new score until the round closes", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    await answer(room.code, room.tokens[0], { round: 1, answer: round.right });

    expect((await state(room.code, room.tokens[0])).body.me).toEqual({
      nickname: "Anna",
      score: 0,
      rank: 1,
      answer: round.right,
      correct: null,
      points: null,
    });
    expect((await state(room.code, room.creatorToken)).body.scoreboard).toEqual([
      { rank: 1, nickname: "Anna", score: 0 },
      { rank: 1, nickname: "Ben", score: 0 },
    ]);
  });

  it("closes the round when every player has answered and then shows the song, results and scores", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    wait(3);
    await answer(room.code, room.tokens[0], { round: 1, answer: round.right });
    await answer(room.code, room.tokens[1], { round: 1, answer: round.wrong });

    const creator = (await state(room.code, room.creatorToken)).body;

    const stored = (await roundsOf(room.code))[0];
    expect(stored.status).toBe("answered");
    expect(creator.status).toBe("playing");
    expect(creator.round).toEqual({
      number: 1,
      status: "closed",
      options: stored.options,
      secondsLeft: 0,
      answeredCount: 2,
      correctOption: round.right,
      song: {
        title: stored.song.title,
        artist: stored.song.artist,
        artworkUrl: stored.song.artworkUrl,
        storeUrl: stored.song.storeUrl,
      },
    });
    expect(creator.scoreboard).toEqual([
      { rank: 1, nickname: "Anna", score: 140 },
      { rank: 2, nickname: "Ben", score: 0 },
    ]);
    expect(creator.me).toEqual({
      nickname: "Anna",
      score: 140,
      rank: 1,
      answer: round.right,
      correct: true,
      points: 140,
    });
    expect((await state(room.code, room.tokens[1])).body.me).toEqual({
      nickname: "Ben",
      score: 0,
      rank: 2,
      answer: round.wrong,
      correct: false,
      points: 0,
    });
  });

  it("keeps the round open at exactly 15 seconds and closes it just after – on a player's request too", async () => {
    const room = await startedRoom("Anna", "Ben");
    await openRound(room);

    wait(15);
    expect((await state(room.code, room.tokens[1])).body.round).toMatchObject({ status: "open", secondsLeft: 0 });

    wait(0.001);
    expect((await state(room.code, room.tokens[1])).body.round).toMatchObject({ status: "closed", answeredCount: 0 });
    expect((await roundsOf(room.code))[0].status).toBe("answered");
  });

  it("gives a player who did not answer 0 points", async () => {
    const room = await startedRoom("Anna", "Ben");
    const round = await openRound(room);
    await answer(room.code, room.tokens[0], { round: 1, answer: round.right });
    wait(16);

    expect((await state(room.code, room.tokens[1])).body.me).toEqual({
      nickname: "Ben",
      score: 0,
      rank: 2,
      answer: null,
      correct: false,
      points: 0,
    });
  });

  it("answers two requests at the closing moment the same way and closes the round once", async () => {
    const room = await startedRoom("Anna", "Ben");
    await openRound(room);
    wait(16);

    const [a, b] = await Promise.all([state(room.code, room.creatorToken), state(room.code, room.creatorToken)]);

    expect(a.status).toBe(200);
    expect(a).toEqual(b);
    expect(a.body.round).toMatchObject({ number: 1, status: "closed" });
  });

  it("finishes the room after round 5 with shared ranks, and stays finished", async () => {
    const room = await startedRoom("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = room.tokens;
    for (let i = 1; i <= 5; i++) {
      const round = await openRound(room);
      wait(3);
      // Anna and Ben answer correctly at the same moment, Cleo is wrong.
      await answer(room.code, anna, { round: i, answer: round.right });
      await answer(room.code, ben, { round: i, answer: round.right });
      await answer(room.code, cleo, { round: i, answer: round.wrong });
    }

    const creator = (await state(room.code, room.creatorToken)).body;

    expect(creator.status).toBe("finished");
    expect(creator.round).toMatchObject({ number: 5, status: "closed" });
    expect(creator.scoreboard).toEqual([
      { rank: 1, nickname: "Anna", score: 700 },
      { rank: 1, nickname: "Ben", score: 700 },
      { rank: 3, nickname: "Cleo", score: 0 },
    ]);
    expect((await state(room.code, ben)).body.me).toMatchObject({ nickname: "Ben", score: 700, rank: 1 });
    expect((await state(room.code, cleo)).body.me).toMatchObject({ nickname: "Cleo", score: 0, rank: 3 });
    expect(await statusOf(room.code)).toBe("finished");

    wait(60);
    expect((await state(room.code, room.creatorToken)).body).toEqual(creator);
  });

  it("rejects a wrong token and a token from another room", async () => {
    const room = await newRoom("Anna");
    const other = await newRoom("Zoe");
    const otherPlayer = await joined(other.code, "Max");

    for (const token of [null, "abc", "f".repeat(64), other.creatorToken, otherPlayer]) {
      expect(await state(room.code, token)).toEqual({
        status: 403,
        body: { error: "wrong-token", message: expect.any(String) },
      });
    }
  });

  it("tells a visitor without a seat that the game has started, so the link does not offer the nickname form", async () => {
    const room = await startedRoom("Anna", "Ben");

    for (const token of [null, "f".repeat(64)]) {
      expect(await state(room.code, token)).toEqual({
        status: 409,
        body: { error: "room-started", message: "This game has already started." },
      });
    }
  });

  it("rejects an unknown room with 404", async () => {
    const room = await newRoom();
    expect(await state("999999", room.creatorToken)).toMatchObject({ status: 404, body: { error: "room-not-found" } });
    expect(await state("abc", room.creatorToken)).toMatchObject({ status: 404, body: { error: "room-not-found" } });
  });

  it("says 'This room has closed' after 3 hours – also for a finished room", async () => {
    const room = await startedRoom("Anna", "Ben");
    await db.query("UPDATE rooms SET status = 'finished' WHERE code = $1", [room.code]);
    wait(3 * HOURS);

    for (const token of room.tokens) {
      expect(await state(room.code, token)).toEqual({
        status: 409,
        body: { error: "room-closed", message: "This room has closed." },
      });
    }
  });
});

describe("POST /api/rooms/[code]/replace", () => {
  it("gives a waiting round another song and the creator's clip list shows the new clip", async () => {
    const room = await startedRoom("Anna", "Ben");
    const before = await roundsOf(room.code);

    const result = await replace(room.code, room.creatorToken, { round: 3 });

    const after = await roundsOf(room.code);
    expect(before.map((r) => r.songId)).not.toContain(after[2].songId);
    expect(after[2].status).toBe("waiting");
    expect(result).toEqual({ status: 200, body: { round: 3, previewUrl: after[2].song.previewUrl } });
    expect(after.filter((_, i) => i !== 2)).toEqual(before.filter((_, i) => i !== 2));
    expect((await state(room.code, room.creatorToken)).body.previewUrls).toEqual(after.map((r) => r.song.previewUrl));
  });

  it("rejects another player's token and another room's creator token, and changes nothing", async () => {
    const room = await startedRoom("Anna", "Ben");
    const other = await newRoom("Zoe");
    const before = await roundsOf(room.code);

    for (const token of [null, room.tokens[1], other.creatorToken]) {
      expect(await replace(room.code, token, { round: 3 })).toMatchObject({ status: 403, body: { error: "wrong-token" } });
    }
    expect(await roundsOf(room.code)).toEqual(before);
  });

  it("rejects a round that has started", async () => {
    const room = await startedRoom("Anna", "Ben");
    await openRound(room);
    expect(await replace(room.code, room.creatorToken, { round: 1 })).toMatchObject({
      status: 409,
      body: { error: "round-already-started" },
    });

    wait(16);
    await state(room.code, room.creatorToken); // closes round 1
    expect(await replace(room.code, room.creatorToken, { round: 1 })).toMatchObject({
      status: 409,
      body: { error: "round-already-started" },
    });
  });

  it("rejects the lobby, a round out of range and a body that is not valid", async () => {
    const lobby = await newRoom();
    expect(await replace(lobby.code, lobby.creatorToken, { round: 1 })).toMatchObject({ status: 409, body: { error: "not-started" } });

    const room = await startedRoom("Anna", "Ben");
    expect(await replace(room.code, room.creatorToken, { round: 6 })).toMatchObject({ status: 400, body: { error: "round-out-of-range" } });
    for (const body of ["not json", { round: "2" }, { round: 0 }, {}]) {
      expect(await replace(room.code, room.creatorToken, body)).toMatchObject({ status: 400, body: { error: "malformed" } });
    }
  });

  it("returns 503 when no unused song with a clip is left", async () => {
    db = await createTestDb();
    await addTestSongs(db, 5); // exactly the 5 songs of the game
    session = await loggedInSession(db, START);
    const room = await startedRoom("Anna", "Ben");

    expect(await replace(room.code, room.creatorToken, { round: 2 })).toMatchObject({
      status: 503,
      body: { error: "not-enough-songs" },
    });
  });
});

describe("a whole room game", () => {
  it("plays 5 rounds: the creator and one player; the scores add up and the game ID never leaves the server", async () => {
    const replies: Reply[] = [];
    const keep = (reply: Reply) => {
      replies.push(reply);
      return reply;
    };

    const created = keep(await create(session, { nickname: "Anna" }));
    const { code, playerToken: anna } = created.body as { code: string; playerToken: string };
    const ben = (keep(await join(code, "Ben")).body as { playerToken: string }).playerToken;
    keep(await start(code, anna));

    for (let i = 1; i <= 5; i++) {
      expect(keep(await next(code, anna))).toMatchObject({ status: 200, body: { round: i } });
      const right = (await roundsOf(code))[i - 1].correctOption;
      keep(await state(code, ben));

      // Ben answers at once: right in rounds 1 and 2 (150 points each), wrong afterwards.
      keep(await answer(code, ben, { round: i, answer: i <= 2 ? right : (right + 1) % 4 }));
      // Anna, the room creator, is always right after 3 seconds (140 points).
      wait(3);
      keep(await answer(code, anna, { round: i, answer: right }));

      keep(await state(code, anna));
      keep(await state(code, ben));
    }

    const creator = keep(await state(code, anna)).body;
    expect(creator.status).toBe("finished");
    expect(creator.scoreboard).toEqual([
      { rank: 1, nickname: "Anna", score: 700 },
      { rank: 2, nickname: "Ben", score: 300 },
    ]);
    expect(creator.me).toMatchObject({ score: 700, rank: 1 });
    expect(keep(await state(code, ben)).body.me).toMatchObject({ score: 300, rank: 2 });

    const gameId = await gameIdOf(code);
    for (const reply of replies) {
      expect(reply.status).toBeLessThan(400);
      expect(JSON.stringify(reply.body)).not.toContain(gameId);
    }
  });
});

describe("every error", () => {
  it("has a human-readable message", async () => {
    const result = await join("999999", "Anna");
    expect(result).toEqual({
      status: 404,
      body: { error: "room-not-found", message: "There is no room with this code." },
    });
  });
});
