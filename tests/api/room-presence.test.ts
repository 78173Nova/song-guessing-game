import { beforeEach, describe, expect, it } from "vitest";
import {
  answerRoomRound,
  createNewRoom,
  getRoomState,
  joinRoom,
  kickRoomPlayer,
  playerLeavesRoom,
  startRoomGame,
} from "@/lib/api/rooms";
import type { TransactionDb } from "@/lib/db/client";
import { getGameRounds } from "@/lib/db/games";
import { DEFAULT_ROOM_SETTINGS } from "@/lib/game/room-settings";
import { loggedInSession } from "../helpers/session";
import { addTestSongs } from "../helpers/songs";
import { createTestDb } from "../helpers/test-db";

// Away, kick and leave (issue #40), through the room API against PGlite. The clock only moves when a test moves it.
// A player is away once their device has not asked for the room state for 5 s; the room creator can kick a player
// who has been away for more than 60 s; anyone can leave.
let db: TransactionDb;
let clock: Date;
let nextCode: number;
let session: string;
const deps = { now: () => clock };
const START = new Date("2026-11-15T12:00:00.000Z");

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

const bearer = (token: string | null) => (token === null ? null : `Bearer ${token}`);
const json = (body: unknown) => (typeof body === "string" ? body : JSON.stringify(body));

const state = (code: string, token: string | null) => getRoomState(db, code, bearer(token), deps);
const start = (code: string, token: string) => startRoomGame(db, code, bearer(token), deps);
const answer = (code: string, token: string, body: unknown) => answerRoomRound(db, code, bearer(token), json(body), deps);
const kick = (code: string, token: string | null, body: unknown) => kickRoomPlayer(db, code, bearer(token), json(body), deps);
const leave = (code: string, token: string | null) => playerLeavesRoom(db, code, bearer(token), deps);
// A join that also sends the token this tab had before (a kicked player trying again).
const rejoin = (code: string, nickname: string, oldToken: string) =>
  joinRoom(db, code, json({ nickname }), deps, { authorization: bearer(oldToken) });

async function newRoom(creator = "Anna", isPrivate = false) {
  const body = isPrivate ? { nickname: creator, private: true } : { nickname: creator };
  const result = await createNewRoom(db, session, json(body), { ...deps, newCode: () => String(nextCode++) });
  if (result.status !== 201) throw new Error("Test setup: the room was not created");
  const { code, playerToken } = result.body as { code: string; playerToken: string };
  return { code, creatorToken: playerToken };
}

async function joined(code: string, nickname: string): Promise<string> {
  wait(0.001);
  const result = await joinRoom(db, code, json({ nickname }), deps);
  if (result.status !== 201) throw new Error(`Test setup: ${nickname} could not join`);
  return (result.body as { playerToken: string }).playerToken;
}

// A lobby: tokens[0] is the creator's.
async function lobby(creator: string, ...others: string[]) {
  const room = await newRoom(creator);
  const tokens = [room.creatorToken];
  for (const nickname of others) tokens.push(await joined(room.code, nickname));
  return { ...room, tokens };
}

async function startedRoom(creator: string, ...others: string[]) {
  const room = await lobby(creator, ...others);
  if ((await start(room.code, room.creatorToken)).status !== 200) throw new Error("Test setup: no start");
  return room;
}

// Moves the clock to the start of the next scheduled round; returns its number and right option.
async function openRound(code: string, token: string) {
  const upcoming = (await state(code, token)).body.nextRound as { number: number; startsAt: string } | null;
  if (!upcoming) throw new Error("Test setup: no round is scheduled");
  clock = new Date(upcoming.startsAt);
  const rows = await db.query<{ game_id: string }>("SELECT game_id FROM rooms WHERE code = $1", [code]);
  const rounds = (await getGameRounds(db, rows[0].game_id))!;
  return { number: upcoming.number, right: rounds[upcoming.number - 1].correctOption };
}

describe("away", () => {
  it("lists a player as away from 5 s without a state request, for everyone, and not before", async () => {
    const room = await lobby("Anna", "Ben");
    const [anna, ben] = room.tokens;
    await state(room.code, ben); // Ben's device asks at this moment

    wait(4.999);
    expect((await state(room.code, anna)).body.away).toEqual([]);

    wait(0.001); // exactly 5 s since Ben's last request
    expect((await state(room.code, anna)).body.away).toEqual(["Ben"]);
  });

  it("removes the away mark as soon as the player's device asks again (a reload keeps the seat)", async () => {
    const room = await lobby("Anna", "Ben");
    const [anna, ben] = room.tokens;
    wait(30);
    expect((await state(room.code, anna)).body.away).toEqual(["Ben"]);

    const back = await state(room.code, ben);
    expect(back.status).toBe(200);
    expect(back.body.away).toEqual([]); // Anna asked at this same moment
    expect((await state(room.code, anna)).body.away).toEqual([]);
  });

  it("counts from the join for a player whose device has not asked yet", async () => {
    const room = await lobby("Anna", "Ben"); // the clock stands at Ben's join
    const [anna] = room.tokens;
    wait(4.999);
    expect((await state(room.code, anna)).body.away).toEqual([]);
    wait(0.001);
    expect((await state(room.code, anna)).body.away).toEqual(["Ben"]);
  });

  it("gives an away player 0 points for the rounds they miss, and the round still closes after 15 s", async () => {
    const room = await startedRoom("Anna", "Ben");
    const [anna] = room.tokens;
    const round = await openRound(room.code, anna);
    expect((await answer(room.code, anna, { round: round.number, answer: round.right })).status).toBe(200);
    wait(15.001);

    const reply = (await state(room.code, anna)).body;
    expect(reply.away).toEqual(["Ben"]);
    expect((reply.round as { status: string }).status).toBe("closed");
    expect(reply.standings).toEqual([
      { rank: 1, nickname: "Anna", score: expect.any(Number) },
      { rank: 2, nickname: "Ben", score: 0 },
    ]);
  });
});

describe("kick", () => {
  // Anna (creator) and Ben, Ben's device stops asking; Anna keeps asking. Returns when Ben has been silent for
  // `seconds`.
  async function benSilentFor(seconds: number, started = false) {
    const room = started ? await startedRoom("Anna", "Ben", "Cleo") : await lobby("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = room.tokens;
    await state(room.code, ben);
    wait(seconds);
    await state(room.code, cleo);
    return { code: room.code, anna, ben, cleo };
  }

  it("is refused while the player has been away for 60 s or less (65 s without a request) and works just after", async () => {
    const { code, anna } = await benSilentFor(65);
    expect((await state(code, anna)).body.kickable).toEqual([]);
    const refused = await kick(code, anna, { nickname: "Ben" });
    expect(refused).toMatchObject({ status: 409, body: { error: "not-away-long-enough" } });

    wait(0.001);
    expect((await state(code, anna)).body.kickable).toEqual(["Ben"]);
    expect(await kick(code, anna, { nickname: "Ben" })).toEqual({ status: 200, body: { nickname: "Ben" } });
    expect((await state(code, anna)).body.players).toEqual(["Anna", "Cleo"]);
  });

  it("is refused from anyone but the room creator, and lists kickable players only for the creator", async () => {
    const { code, cleo } = await benSilentFor(120);
    expect((await state(code, cleo)).body.kickable).toEqual([]);
    expect(await kick(code, cleo, { nickname: "Ben" })).toMatchObject({ status: 403, body: { error: "not-creator" } });
    expect(await kick(code, null, { nickname: "Ben" })).toMatchObject({ status: 403, body: { error: "wrong-token" } });
    expect((await state(code, cleo)).body.players).toEqual(["Anna", "Ben", "Cleo"]);
  });

  it("rejects a body that is not valid, an unknown nickname and the creator kicking themselves", async () => {
    const { code, anna } = await benSilentFor(120);
    expect((await kick(code, anna, "not json")).status).toBe(400);
    expect((await kick(code, anna, { nickname: 42 })).status).toBe(400);
    expect((await kick(code, anna, { nickname: "Zoe" })).status).toBe(404);
    expect((await kick(code, anna, { nickname: "Anna" })).status).toBe(404);
  });

  it("finds the nickname ignoring upper/lower case and spaces around it", async () => {
    const { code, anna } = await benSilentFor(120);
    expect((await kick(code, anna, { nickname: "  ben " })).status).toBe(200);
  });

  it("a kicked player cannot come back: their token is refused and they cannot join again", async () => {
    const { code, anna, ben } = await benSilentFor(120);
    await kick(code, anna, { nickname: "Ben" });

    expect(await state(code, ben)).toMatchObject({ status: 403, body: { error: "kicked" } });
    expect(await rejoin(code, "Benny", ben)).toMatchObject({ status: 403, body: { error: "kicked" } });
    expect((await joinRoom(db, code, json({ nickname: "Ben" }), deps)).status).toBe(409); // nickname stays taken
    expect((await state(code, anna)).body.players).toEqual(["Anna", "Cleo"]);
  });

  // A full room starts by itself (#34), so a freed seat shows as one more join before the room is full.
  it("frees the seat in the lobby: the room fills up one player later", async () => {
    // Private: a public lobby with 2+ players would start after 60 s (issue #37).
    const room = await newRoom("Anna", true);
    await joined(room.code, "Ben");
    for (let i = 3; i <= 24; i++) await joined(room.code, `P${i}`); // 24 of 25 seats taken
    wait(66);
    await state(room.code, room.creatorToken);
    expect((await kick(room.code, room.creatorToken, { nickname: "Ben" })).status).toBe(200);

    await joined(room.code, "Late");
    expect((await state(room.code, room.creatorToken)).body.status).toBe("lobby"); // 24 again, Ben's seat is free
    await joined(room.code, "Later");
    expect((await state(room.code, room.creatorToken)).body.status).toBe("playing");
  });

  it("during the game: the kicked player disappears from the standings and the round no longer waits for them", async () => {
    const room = await startedRoom("Anna", "Ben");
    const [anna, ben] = room.tokens;
    let round = await openRound(room.code, anna);
    await answer(room.code, ben, { round: round.number, answer: round.right }); // Ben scores in round 1
    await answer(room.code, anna, { round: round.number, answer: (round.right + 1) % 4 });
    round = await openRound(room.code, anna);
    wait(66);
    await state(room.code, anna);
    expect((await kick(room.code, anna, { nickname: "Ben" })).status).toBe(200);
    // round 2 has long run out; round 3: Anna alone answers and it closes at once
    round = await openRound(room.code, anna);
    await answer(room.code, anna, { round: round.number, answer: round.right });
    const reply = (await state(room.code, anna)).body;
    expect((reply.round as { status: string }).status).toBe("closed");
    expect(reply.standings).toEqual([{ rank: 1, nickname: "Anna", score: expect.any(Number) }]);
    expect(await answer(room.code, ben, { round: round.number, answer: 0 })).toMatchObject({ status: 403 });
  });
});

describe("leave", () => {
  it("in the lobby: the seat frees up, the token stops working, and the same nickname can join again", async () => {
    const room = await lobby("Anna", "Ben");
    const [anna, ben] = room.tokens;
    expect(await leave(room.code, ben)).toEqual({ status: 200, body: { left: true, roomClosed: false } });

    expect((await state(room.code, anna)).body.players).toEqual(["Anna"]);
    expect(await state(room.code, ben)).toMatchObject({ status: 403, body: { error: "wrong-token" } });
    expect((await joinRoom(db, room.code, json({ nickname: "Ben" }), deps)).status).toBe(201);
  });

  it("in the lobby: the seat counts as free again – the room fills up one player later", async () => {
    const room = await lobby("Anna", "Ben");
    for (let i = 3; i <= 24; i++) await joined(room.code, `P${i}`); // 24 of 25 seats taken
    await leave(room.code, room.tokens[1]);

    await joined(room.code, "Late");
    expect((await state(room.code, room.creatorToken)).body.status).toBe("lobby");
    await joined(room.code, "Later");
    expect((await state(room.code, room.creatorToken)).body.status).toBe("playing");
  });

  it("the room creator leaving the lobby closes the room for everyone", async () => {
    const room = await lobby("Anna", "Ben");
    const [anna, ben] = room.tokens;
    expect(await leave(room.code, anna)).toEqual({ status: 200, body: { left: true, roomClosed: true } });

    const closed = { status: 409, body: { error: "room-closed-by-creator", message: "The room creator closed the room." } };
    expect(await state(room.code, ben)).toMatchObject(closed);
    expect(await state(room.code, null)).toMatchObject(closed);
    expect(await joinRoom(db, room.code, json({ nickname: "Cleo" }), deps)).toMatchObject(closed);
    expect(await start(room.code, anna)).toMatchObject(closed);
  });

  it("during the game: the player is gone for good, out of the standings, and the others play on", async () => {
    const room = await startedRoom("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = room.tokens;
    let round = await openRound(room.code, anna);
    await answer(room.code, ben, { round: round.number, answer: round.right });
    expect(await leave(room.code, ben)).toEqual({ status: 200, body: { left: true, roomClosed: false } });

    expect(await state(room.code, ben)).toMatchObject({ status: 403, body: { error: "left" } });
    expect(await answer(room.code, ben, { round: round.number, answer: 0 })).toMatchObject({ status: 403 });
    // Anna and Cleo answering is now everyone: the round closes at once
    await answer(room.code, anna, { round: round.number, answer: round.right });
    await answer(room.code, cleo, { round: round.number, answer: round.right });
    const reply = (await state(room.code, anna)).body;
    expect((reply.round as { status: string }).status).toBe("closed");
    expect(reply.players).toEqual(["Anna", "Cleo"]);
    expect((reply.standings as { nickname: string }[]).map((s) => s.nickname)).toEqual(["Anna", "Cleo"]);
    round = await openRound(room.code, anna);
    expect(round.number).toBe(2);
  });

  it("the room creator leaving during the game: the game goes on by itself and nobody can kick", async () => {
    const room = await startedRoom("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = room.tokens;
    await state(room.code, ben);
    expect(await leave(room.code, anna)).toEqual({ status: 200, body: { left: true, roomClosed: false } });

    wait(120); // Ben has long been away, and the whole game has run out
    const reply = await state(room.code, cleo);
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ status: "finished", players: ["Ben", "Cleo"], kickable: [] });
    expect((await kick(room.code, anna, { nickname: "Ben" })).status).toBe(403);
    expect(await kick(room.code, cleo, { nickname: "Ben" })).toMatchObject({ status: 403, body: { error: "not-creator" } });
  });

  it("in a two-player game the one who stays plays on alone to the end", async () => {
    const room = await startedRoom("Anna", "Ben");
    const [anna, ben] = room.tokens;
    await leave(room.code, ben);
    for (let n = 1; n <= 5; n++) {
      const round = await openRound(room.code, anna);
      expect(round.number).toBe(n);
      expect((await answer(room.code, anna, { round: n, answer: round.right })).status).toBe(200);
    }
    expect((await state(room.code, anna)).body).toMatchObject({ status: "finished", players: ["Anna"] });
  });

  it("closes the room once everyone has left", async () => {
    const room = await startedRoom("Anna", "Ben");
    const [anna, ben] = room.tokens;
    await leave(room.code, anna);
    expect(await state(room.code, ben)).toMatchObject({ status: 200 });
    await leave(room.code, ben);
    expect(await state(room.code, ben)).toMatchObject({ status: 409, body: { error: "room-closed" } });
    expect(await state(room.code, null)).toMatchObject({ status: 409, body: { error: "room-closed" } });
  });

  it("also works after the game has finished: the player leaves the final standings", async () => {
    const room = await startedRoom("Anna", "Ben");
    const [anna, ben] = room.tokens;
    wait(10 * 60);
    expect((await state(room.code, anna)).body.status).toBe("finished");
    await leave(room.code, ben);
    expect((await state(room.code, anna)).body.standings).toEqual([{ rank: 1, nickname: "Anna", score: 0 }]);
  });

  it("is refused without a token, with an unknown token, and a second time", async () => {
    const room = await startedRoom("Anna", "Ben");
    expect((await leave(room.code, null)).status).toBe(403);
    expect((await leave(room.code, "f".repeat(64))).status).toBe(403);
    await leave(room.code, room.tokens[1]);
    expect(await leave(room.code, room.tokens[1])).toMatchObject({ status: 403, body: { error: "left" } });
    expect((await leave("999999", room.tokens[0])).status).toBe(404);
  });
});

describe("Duel room", () => {
  it("when one player leaves the game, the other – here the guest after the room creator left – plays on alone to the end", async () => {
    const created = await createNewRoom(
      db,
      session,
      json({ nickname: "Anna", settings: { ...DEFAULT_ROOM_SETTINGS, type: "duel" } }),
      { ...deps, newCode: () => String(nextCode++) },
    );
    const { code, playerToken: anna } = created.body as { code: string; playerToken: string };
    const ben = await joined(code, "Ben"); // the second seat starts the Duel by itself
    expect((await state(code, ben)).body.status).toBe("playing");

    expect(await leave(code, anna)).toEqual({ status: 200, body: { left: true, roomClosed: false } });
    for (let n = 1; n <= 5; n++) {
      const round = await openRound(code, ben);
      expect((await answer(code, ben, { round: n, answer: round.right })).status).toBe(200);
    }
    expect((await state(code, ben)).body).toMatchObject({ status: "finished", players: ["Ben"] });
  });
});
