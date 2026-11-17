import { beforeEach, describe, expect, it } from "vitest";
import {
  answerRoomRound,
  createNewRoom,
  getRoomState,
  joinRoom,
  playAgainInRoom,
  playerLeavesRoom,
  startRoomGame,
} from "@/lib/api/rooms";
import type { TransactionDb } from "@/lib/db/client";
import { getGameRounds } from "@/lib/db/games";
import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from "@/lib/game/room-settings";
import { loggedInSession } from "../helpers/session";
import { addTestSongs } from "../helpers/songs";
import { createTestDb } from "../helpers/test-db";

// Play again (issue #43), through the room API against PGlite. The clock only moves when a test moves it, and the
// random numbers come from a list the test controls. After a game, every player has 60 s (counted from the end
// screen) to choose "Play again" or "Leave"; the voters go back to the lobby, the others are removed.
let db: TransactionDb;
let clock: Date;
let nextCode: number;
let session: string;
let randomValue: number;
const deps = { now: () => clock, random: () => randomValue };
const START = new Date("2026-11-15T12:00:00.000Z");
// Short games: one set of 3 songs.
const SETTINGS: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, songsPerSet: 3, sets: 1 };
// From the last round's close: 5 s result + 5 s final standings (the end screen), then 60 s to choose.
const VOTE_ENDS_AFTER_CLOSE = 70;

function wait(seconds: number) {
  clock = new Date(clock.getTime() + seconds * 1000);
}

beforeEach(async () => {
  db = await createTestDb();
  await addTestSongs(db, 12);
  clock = START;
  nextCode = 482913;
  randomValue = 0;
  session = await loggedInSession(db, START);
});

const bearer = (token: string | null) => (token === null ? null : `Bearer ${token}`);
const json = (body: unknown) => (typeof body === "string" ? body : JSON.stringify(body));

const state = (code: string, token: string | null) => getRoomState(db, code, bearer(token), deps);
const start = (code: string, token: string) => startRoomGame(db, code, bearer(token), deps);
const answer = (code: string, token: string, body: unknown) => answerRoomRound(db, code, bearer(token), json(body), deps);
const leave = (code: string, token: string) => playerLeavesRoom(db, code, bearer(token), deps);
const playAgain = (code: string, token: string | null) => playAgainInRoom(db, code, bearer(token), deps);

async function newRoom(creator = "Anna", settings = SETTINGS) {
  const result = await createNewRoom(db, session, json({ nickname: creator, settings }), {
    ...deps,
    newCode: () => String(nextCode++),
  });
  if (result.status !== 201) throw new Error("Test setup: the room was not created");
  const { code, playerToken } = result.body as { code: string; playerToken: string };
  return { code, creatorToken: playerToken };
}

async function joined(code: string, nickname: string): Promise<string> {
  wait(0.001);
  const result = await joinRoom(db, code, json({ nickname }), deps);
  if (result.status !== 201) throw new Error(`Test setup: ${nickname} could not join (${result.status})`);
  return (result.body as { playerToken: string }).playerToken;
}

// A started room: tokens[0] is the creator's.
async function startedRoom(creator: string, ...others: string[]) {
  const room = await newRoom(creator);
  const tokens = [room.creatorToken];
  for (const nickname of others) tokens.push(await joined(room.code, nickname));
  if ((await start(room.code, room.creatorToken)).status !== 200) throw new Error("Test setup: no start");
  return { ...room, tokens };
}

async function gameId(code: string): Promise<string> {
  const rows = await db.query<{ game_id: string }>("SELECT game_id FROM rooms WHERE code = $1", [code]);
  return rows[0].game_id;
}

// Plays the game to its end: every player in `tokens` answers every round right, so each round closes at once.
// Returns with the clock at the last round's close.
async function playToTheEnd(code: string, tokens: string[]) {
  for (;;) {
    const reply = (await state(code, tokens[0])).body;
    if (reply.status === "finished") return;
    const upcoming = reply.nextRound as { number: number; startsAt: string } | null;
    if (!upcoming) throw new Error("Test setup: no round is scheduled");
    clock = new Date(upcoming.startsAt);
    const rounds = (await getGameRounds(db, await gameId(code)))!;
    for (const token of tokens) {
      wait(0.1);
      await answer(code, token, { round: upcoming.number, answer: rounds[upcoming.number - 1].correctOption });
    }
  }
}

async function finishedRoom(creator: string, ...others: string[]) {
  const room = await startedRoom(creator, ...others);
  await playToTheEnd(room.code, room.tokens);
  return room;
}

describe("the vote after a game", () => {
  it("ends once everyone has chosen Play again: everyone is back in the lobby with the same settings", async () => {
    const room = await finishedRoom("Anna", "Ben");
    const [anna, ben] = room.tokens;

    expect(await playAgain(room.code, anna)).toEqual({ status: 200, body: { playAgain: true } });
    expect((await state(room.code, ben)).body.status).toBe("finished"); // Ben has not chosen yet
    expect((await playAgain(room.code, ben)).status).toBe(200);

    const reply = (await state(room.code, anna)).body;
    expect(reply).toMatchObject({ status: "lobby", players: ["Anna", "Ben"], settings: SETTINGS, role: "creator", startingPlayers: null });
    expect(reply.gameNumber).toBe(2);
  });
});

describe("vote timing and removal", () => {
  it("lasts 60 s after the end screen: exactly then a choice still counts, just after it the vote is over", async () => {
    const room = await finishedRoom("Anna", "Ben", "Cleo");
    const [anna, ben] = room.tokens;
    const reply = (await state(room.code, anna)).body;
    expect(reply.playAgain).toEqual({ endsAt: new Date(clock.getTime() + VOTE_ENDS_AFTER_CLOSE * 1000).toISOString(), chosen: [] });
    expect(reply.gameNumber).toBe(1);

    await playAgain(room.code, anna);
    wait(VOTE_ENDS_AFTER_CLOSE);
    expect((await playAgain(room.code, ben)).status).toBe(200);
    expect((await state(room.code, anna)).body).toMatchObject({ status: "finished", playAgain: { chosen: ["Anna", "Ben"] } });

    wait(0.001);
    expect(await playAgain(room.code, ben)).toMatchObject({ status: 409, body: { error: "vote-over" } });
    expect((await state(room.code, anna)).body).toMatchObject({ status: "lobby", players: ["Anna", "Ben"] });
  });

  it("removes the players who did not choose Play again; their token now says they have left", async () => {
    const room = await finishedRoom("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = room.tokens;
    await playAgain(room.code, anna);
    await playAgain(room.code, cleo);
    wait(VOTE_ENDS_AFTER_CLOSE + 1);

    expect(await state(room.code, ben)).toMatchObject({ status: 403, body: { error: "left" } });
    expect((await state(room.code, cleo)).body).toMatchObject({ status: "lobby", players: ["Anna", "Cleo"] });
    expect(await playAgain(room.code, ben)).toMatchObject({ status: 403, body: { error: "left" } });
  });

  it("changes nothing when nobody chose Play again: the final standings stay and the vote is no longer offered", async () => {
    const room = await finishedRoom("Anna", "Ben");
    const [anna, ben] = room.tokens;
    wait(VOTE_ENDS_AFTER_CLOSE + 1);
    expect((await state(room.code, anna)).body).toMatchObject({ status: "finished", players: ["Anna", "Ben"], playAgain: null });
    expect(await playAgain(room.code, ben)).toMatchObject({ status: 409, body: { error: "vote-over" } });
  });

  it("counts Leave as a choice: the vote ends once everyone else has chosen Play again", async () => {
    const room = await finishedRoom("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = room.tokens;
    await playAgain(room.code, anna);
    expect((await leave(room.code, ben)).status).toBe(200);
    await playAgain(room.code, cleo);
    expect((await state(room.code, anna)).body).toMatchObject({ status: "lobby", players: ["Anna", "Cleo"] });
  });

  it("is refused while the game is still running, without a seat, and with nothing to vote on in the lobby", async () => {
    const room = await startedRoom("Anna", "Ben");
    expect(await playAgain(room.code, room.tokens[0])).toMatchObject({ status: 409, body: { error: "not-finished" } });
    expect(await playAgain(room.code, null)).toMatchObject({ status: 403, body: { error: "wrong-token" } });
    expect(await playAgain("999999", room.tokens[0])).toMatchObject({ status: 404 });
    expect((await state(room.code, room.tokens[0])).body.playAgain).toBeNull();
  });

  it("starts the next game with standings at 0 and a fresh summary", async () => {
    const room = await finishedRoom("Anna", "Ben");
    const [anna, ben] = room.tokens;
    expect(((await state(room.code, anna)).body.standings as { score: number }[])[0].score).toBeGreaterThan(0);
    await playAgain(room.code, anna);
    await playAgain(room.code, ben);

    const lobbyState = (await state(room.code, anna)).body;
    expect(lobbyState.standings).toEqual([
      { rank: 1, nickname: "Anna", score: 0 },
      { rank: 1, nickname: "Ben", score: 0 },
    ]);
    expect(lobbyState).toMatchObject({ round: null, nextRound: null, previewUrls: null, me: { score: 0, summary: [] } });

    expect((await start(room.code, anna)).status).toBe(200);
    const started = (await state(room.code, anna)).body;
    expect(started).toMatchObject({ status: "playing", gameNumber: 2, round: null, me: { score: 0, summary: [] } });
  });
});

describe("room creator handover", () => {
  // Anna creates the room; Ben and Dan join logged in (account holders), Cleo as a guest.
  async function mixedRoom() {
    const room = await newRoom("Anna");
    const tokens: Record<string, string> = { Anna: room.creatorToken };
    for (const nickname of ["Ben", "Cleo", "Dan"]) {
      wait(0.001);
      const login = nickname === "Cleo" ? undefined : await loggedInSession(db, clock, `${nickname.toLowerCase()}_test`);
      const result = await joinRoom(db, room.code, json({ nickname }), deps, { sessionToken: login });
      tokens[nickname] = (result.body as { playerToken: string }).playerToken;
    }
    await start(room.code, tokens.Anna);
    await playToTheEnd(room.code, Object.values(tokens));
    return { code: room.code, tokens };
  }
  const roleOf = async (code: string, token: string) => (await state(code, token)).body.role;

  it("stays with the room creator when they choose Play again", async () => {
    const { code, tokens } = await mixedRoom();
    for (const token of Object.values(tokens)) await playAgain(code, token);
    expect(await roleOf(code, tokens.Anna)).toBe("creator");
    expect(await roleOf(code, tokens.Ben)).toBe("player");
  });

  it("passes at random to an account holder who chose Play again, never to a guest", async () => {
    const { code, tokens } = await mixedRoom();
    randomValue = 0.5; // Dan of Ben and Dan (with Cleo counted it would be Cleo)
    await leave(code, tokens.Anna);
    for (const nickname of ["Ben", "Cleo", "Dan"]) await playAgain(code, tokens[nickname]); // the last choice ends the vote
    expect((await state(code, tokens.Cleo)).body).toMatchObject({ status: "lobby", role: "player" });
    expect(await roleOf(code, tokens.Ben)).toBe("player");
    expect(await roleOf(code, tokens.Dan)).toBe("creator");

    // The new room creator runs the room: Start now works for them only.
    expect((await start(code, tokens.Ben)).status).toBe(403);
    expect((await start(code, tokens.Dan)).status).toBe(200);
  });

  it("passes to a room creator who did not choose at all (the 60 s ran out)", async () => {
    const { code, tokens } = await mixedRoom();
    await playAgain(code, tokens.Ben);
    await playAgain(code, tokens.Cleo);
    wait(VOTE_ENDS_AFTER_CLOSE + 1);
    await state(code, tokens.Ben);
    expect(await state(code, tokens.Anna)).toMatchObject({ status: 403, body: { error: "left" } });
    expect(await roleOf(code, tokens.Ben)).toBe("creator");
  });

  it("prefers an account holder who is not away", async () => {
    const { code, tokens } = await mixedRoom();
    await playAgain(code, tokens.Ben);
    await playAgain(code, tokens.Dan);
    await playAgain(code, tokens.Cleo);
    wait(VOTE_ENDS_AFTER_CLOSE - 2);
    await state(code, tokens.Dan); // Dan's device keeps asking; Ben's has been silent since his choice
    wait(3);
    randomValue = 0; // would pick Ben first if he were not away
    await state(code, tokens.Dan);
    expect(await roleOf(code, tokens.Dan)).toBe("creator");
    expect(await roleOf(code, tokens.Ben)).toBe("player");
  });

  it("still passes to an away account holder when every account holder who chose Play again is away", async () => {
    const { code, tokens } = await mixedRoom();
    await playAgain(code, tokens.Ben);
    await playAgain(code, tokens.Cleo);
    wait(VOTE_ENDS_AFTER_CLOSE + 1); // Ben has been silent since his choice
    randomValue = 0;
    await state(code, tokens.Cleo);
    expect(await roleOf(code, tokens.Ben)).toBe("creator");
    expect(await roleOf(code, tokens.Cleo)).toBe("player");
  });

  it("closes the room for everyone when no account holder chose Play again", async () => {
    const { code, tokens } = await mixedRoom();
    await leave(code, tokens.Anna);
    await leave(code, tokens.Ben);
    await leave(code, tokens.Dan);
    await playAgain(code, tokens.Cleo);

    const closed = await state(code, tokens.Cleo);
    expect(closed).toEqual({
      status: 409,
      body: { error: "no-account-holder", message: "No account holder is left to run the room." },
    });
    expect((await joinRoom(db, code, json({ nickname: "Eve" }), deps)).status).toBe(409);
  });
});

describe("back in the lobby", () => {
  it("lets new players join up to the limit; the 30-minute lobby limit counts from the return to the lobby", async () => {
    const room = await newRoom("Anna");
    const ben = await joined(room.code, "Ben");
    wait(29 * 60); // the first lobby almost ran out
    await start(room.code, room.creatorToken);
    await playToTheEnd(room.code, [room.creatorToken, ben]);
    await playAgain(room.code, room.creatorToken);
    await playAgain(room.code, ben);
    expect((await state(room.code, ben)).body.status).toBe("lobby"); // more than 30 minutes after creation

    const cleo = await joined(room.code, "Cleo");
    expect((await state(room.code, cleo)).body).toMatchObject({ status: "lobby", players: ["Anna", "Ben", "Cleo"] });

    wait(30 * 60 - 1);
    expect((await state(room.code, cleo)).status).toBe(200);
    wait(1);
    expect(await state(room.code, cleo)).toMatchObject({ status: 409, body: { error: "room-closed" } });
  });

  it("with one player left, waits for a second: Start now is refused until someone joins", async () => {
    const room = await finishedRoom("Anna", "Ben");
    await playAgain(room.code, room.tokens[0]);
    await leave(room.code, room.tokens[1]);
    expect((await state(room.code, room.tokens[0])).body).toMatchObject({ status: "lobby", players: ["Anna"] });
    expect(await start(room.code, room.tokens[0])).toMatchObject({ status: 409, body: { error: "not-enough-players" } });

    await joined(room.code, "Cleo");
    expect((await start(room.code, room.tokens[0])).status).toBe(200);
  });

  it("starts a full room by itself: a Duel where both choose Play again plays its next game at once", async () => {
    const room = await newRoom("Anna", { ...SETTINGS, type: "duel" });
    const ben = await joined(room.code, "Ben"); // fills the Duel: it starts
    await playToTheEnd(room.code, [room.creatorToken, ben]);
    await playAgain(room.code, room.creatorToken);
    await playAgain(room.code, ben);
    expect((await state(room.code, ben)).body).toMatchObject({ status: "playing", gameNumber: 2 });
  });

  it("is a lobby again as soon as the last player chooses, before any device asks for the state", async () => {
    const room = await finishedRoom("Anna", "Ben");
    for (const token of room.tokens) await playAgain(room.code, token);
    expect((await joinRoom(db, room.code, json({ nickname: "Cleo" }), deps)).status).toBe(201);
  });
});

describe("several games in one room", () => {
  const titlesPlayed = async (code: string, token: string) =>
    ((await state(code, token)).body.me as { summary: { title: string }[] }).summary.map((item) => item.title);

  // Plays the next game of a room in the lobby to its end (Anna starts it) and returns its titles.
  async function playNextGame(code: string, tokens: string[]) {
    for (const token of tokens) await playAgain(code, token);
    expect((await start(code, tokens[0])).status).toBe(200);
    await playToTheEnd(code, tokens);
    return titlesPlayed(code, tokens[0]);
  }

  it("avoids the songs of earlier games while enough songs match, then plays old ones again", async () => {
    const room = await finishedRoom("Anna", "Ben"); // 12 songs, 3 per game
    const played = [await titlesPlayed(room.code, room.tokens[0])];
    for (let game = 2; game <= 4; game++) played.push(await playNextGame(room.code, room.tokens));
    expect(new Set(played.flat()).size).toBe(12); // games 1–4: 12 different songs

    // Game 5: every song has been played, so it plays old ones rather than not starting.
    expect((await playNextGame(room.code, room.tokens)).length).toBe(3);
  });

  it("offers no Play again after the 5th game and refuses a 6th", async () => {
    const room = await finishedRoom("Anna", "Ben");
    for (let game = 2; game <= 5; game++) await playNextGame(room.code, room.tokens);

    const fifth = (await state(room.code, room.tokens[0])).body;
    expect(fifth).toMatchObject({ status: "finished", gameNumber: 5, playAgain: null });
    expect(await playAgain(room.code, room.tokens[0])).toMatchObject({ status: 409, body: { error: "no-more-games" } });

    wait(10 * 60); // nothing ends the room: the final standings stay, as after a single game
    expect((await state(room.code, room.tokens[1])).body).toMatchObject({ status: "finished", gameNumber: 5 });
  });
});
