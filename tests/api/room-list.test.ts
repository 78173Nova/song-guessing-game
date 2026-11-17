import { beforeEach, describe, expect, it } from "vitest";
import { createNewRoom, joinRoom, listPublicRooms, playerLeavesRoom, startRoomGame } from "@/lib/api/rooms";
import type { TransactionDb } from "@/lib/db/client";
import { listSongs, savePreview, upsertSongs } from "@/lib/db/songs";
import { loggedInSession } from "../helpers/session";
import { createTestDb } from "../helpers/test-db";

// Public rooms and the "Join a room" list (issue #36), through the room API against PGlite. No network.
// The clock only moves when a test moves it.
let db: TransactionDb;
let clock: Date;
let nextCode: number;
let session: string;
const deps = { now: () => clock };
const START = new Date("2026-11-15T12:00:00.000Z");

// 6 genres × 2 decades × 4 songs: enough songs for any room setting used below, in every mode.
const GENRES = ["pop", "rock", "hip-hop", "r&b", "dance", "country"];
const YEARS = [1981, 2011];

async function addCatalogue() {
  const input = GENRES.flatMap((genre) =>
    YEARS.flatMap((year) =>
      Array.from({ length: 6 }, (_, i) => ({
        title: `${genre} ${year} title ${i + 1}`,
        artist: `${genre} ${year} artist ${i + 1}`,
        year: year + i,
        genre,
      })),
    ),
  );
  await upsertSongs(db, input);
  for (const song of await listSongs(db)) {
    await savePreview(
      db,
      song.id,
      {
        previewUrl: `https://audio.example.com/${song.id}.m4a`,
        artworkUrl: `https://art.example.com/${song.id}.jpg`,
        storeUrl: `https://music.example.com/${song.id}`,
      },
      START,
    );
  }
}

beforeEach(async () => {
  db = await createTestDb();
  await addCatalogue();
  clock = START;
  nextCode = 482913;
  session = await loggedInSession(db, START);
});

function wait(seconds: number) {
  clock = new Date(clock.getTime() + seconds * 1000);
}

type Settings = { type: string; mode: string; genres: unknown; decades: unknown; songsPerSet: number; sets: number };
const DEFAULTS: Settings = { type: "multiplayer", mode: "title", genres: "any", decades: "any", songsPerSet: 3, sets: 1 };

const create = (body: unknown) =>
  createNewRoom(db, session, JSON.stringify(body), { ...deps, newCode: () => String(nextCode++) });

async function newRoom(settings: Partial<Settings> = {}, options: { creator?: string; private?: unknown } = {}) {
  const body: Record<string, unknown> = { nickname: options.creator ?? "Anna", settings: { ...DEFAULTS, ...settings } };
  if ("private" in options) body.private = options.private;
  wait(0.001);
  const result = await create(body);
  if (result.status !== 201) throw new Error(`Test setup: the room was not created (${JSON.stringify(result.body)})`);
  const { code, playerToken } = result.body as { code: string; playerToken: string };
  return { code, creatorToken: playerToken };
}

async function joined(code: string, nickname: string): Promise<string> {
  wait(0.001);
  const result = await joinRoom(db, code, JSON.stringify({ nickname }), deps);
  if (result.status !== 201) throw new Error(`Test setup: ${nickname} could not join (${JSON.stringify(result.body)})`);
  return (result.body as { playerToken: string }).playerToken;
}

type Filter = { type?: string; mode?: string; genres?: string; decades?: string };
const ANY: Required<Filter> = { type: "multiplayer", mode: "any", genres: "any", decades: "any" };

const list = (filter: Filter | Record<string, string> = {}) =>
  listPublicRooms(db, new URLSearchParams({ ...ANY, ...filter }), deps);

async function listedCodes(filter: Filter = {}): Promise<string[]> {
  const result = await list(filter);
  if (result.status !== 200) throw new Error(`The list was refused (${JSON.stringify(result.body)})`);
  return (result.body as { rooms: { code: string }[] }).rooms.map((room) => room.code).sort();
}

describe("GET /api/rooms – the list of public rooms", () => {
  it("lists a public room in the lobby with its creator, settings and players", async () => {
    const { code } = await newRoom(
      { mode: "artist", genres: ["pop", "rock"], decades: [1980], songsPerSet: 5, sets: 2 },
      { creator: "Anna" },
    );
    await joined(code, "Ben");

    expect(await list()).toEqual({
      status: 200,
      body: {
        rooms: [
          {
            code,
            creator: "Anna",
            type: "multiplayer",
            mode: "artist",
            genres: ["pop", "rock"],
            decades: [1980],
            songsPerSet: 5,
            sets: 2,
            players: 2,
            maxPlayers: 25,
            countdownEndsAt: new Date(clock.getTime() + 60_000).toISOString(), // issue #37: 60 s from Ben's join
          },
        ],
      },
    });
  });
});

describe("POST /api/rooms – public or private", () => {
  it("makes a room public unless private is chosen, and never lists a private room", async () => {
    const plain = await newRoom();
    const publicRoom = await newRoom({}, { private: false });
    const privateRoom = await newRoom({}, { private: true });

    expect(await listedCodes()).toEqual([plain.code, publicRoom.code].sort());
    // A private room can still be joined by its code.
    await joined(privateRoom.code, "Ben");
    expect(await listedCodes()).not.toContain(privateRoom.code);
  });

  it("refuses a private choice that is not true or false with 400 and creates no room", async () => {
    for (const value of ["yes", 1, 0, null, "true", [], {}]) {
      const result = await create({ nickname: "Anna", settings: DEFAULTS, private: value });
      expect(result).toEqual({ status: 400, body: { error: "invalid-settings", message: expect.any(String) } });
    }
    expect(await db.query("SELECT id FROM rooms")).toHaveLength(0);
  });

  it("accepts private without settings (the room gets the default settings)", async () => {
    const result = await create({ nickname: "Anna", private: true });
    expect(result.status).toBe(201);
    expect(await listedCodes()).toEqual([]);
  });
});

describe("GET /api/rooms – which rooms are listed", () => {
  const bearer = (token: string) => `Bearer ${token}`;

  it("drops a room once its game has started", async () => {
    const started = await newRoom();
    const waiting = await newRoom();
    await joined(started.code, "Ben");
    expect((await startRoomGame(db, started.code, bearer(started.creatorToken), deps)).status).toBe(200);

    expect(await listedCodes()).toEqual([waiting.code]);
  });

  it("drops a Duel room once its second player has joined (a full room starts by itself)", async () => {
    const { code } = await newRoom({ type: "duel" });
    const before = await list({ type: "duel" });
    expect(before.body).toEqual({ rooms: [expect.objectContaining({ code, players: 1, maxPlayers: 2 })] });

    await joined(code, "Ben");
    expect(await listedCodes({ type: "duel" })).toEqual([]);
  });

  it("does not list a full room that is still in the lobby because its game could not start", async () => {
    const { code } = await newRoom({ type: "duel" });
    // Setup: the songs are taken out of the catalogue, so the join that fills the room cannot start the game.
    await db.query("UPDATE songs SET in_catalogue = false");
    await joined(code, "Ben");

    expect(await listedCodes({ type: "duel" })).toEqual([]);
  });

  it("drops a room that has closed: 30 minutes in the lobby, or the creator left", async () => {
    const old = await newRoom();
    wait(10 * 60);
    const left = await newRoom();
    const open = await newRoom();
    expect((await playerLeavesRoom(db, left.code, bearer(left.creatorToken), deps)).status).toBe(200);
    expect(await listedCodes()).toEqual([old.code, open.code].sort());

    wait(20 * 60 - 0.003); // the first room is now 1 ms younger than 30 minutes
    expect(await listedCodes()).toEqual([old.code, open.code].sort());
    wait(0.001); // now exactly 30 minutes old
    expect(await listedCodes()).toEqual([open.code]);
  });

  it("counts only the players still in the room: a player who left the lobby frees their seat", async () => {
    const { code } = await newRoom();
    const ben = await joined(code, "Ben");
    await joined(code, "Cleo");
    expect((await playerLeavesRoom(db, code, bearer(ben), deps)).status).toBe(200);

    expect((await list()).body).toEqual({ rooms: [expect.objectContaining({ code, players: 2 })] });
  });

  it("lists the rooms oldest first", async () => {
    const first = await newRoom({}, { creator: "Anna" });
    const second = await newRoom({}, { creator: "Ben" });
    const result = await list();
    expect((result.body as { rooms: { code: string; creator: string }[] }).rooms.map((room) => room.creator)).toEqual([
      "Anna",
      "Ben",
    ]);
    expect([first.code, second.code]).toEqual(["482913", "482914"]);
  });
});

describe("GET /api/rooms – filters", () => {
  // Five public rooms with different settings. Letters name them in the expectations.
  let rooms: Record<"A" | "B" | "C" | "D" | "E", string>;
  beforeEach(async () => {
    rooms = {
      A: (await newRoom({ mode: "title", genres: "any", decades: "any" })).code,
      B: (await newRoom({ mode: "artist", genres: ["pop"], decades: [1980] })).code,
      C: (await newRoom({ mode: "title", genres: ["rock", "pop"], decades: "any" })).code,
      D: (await newRoom({ mode: "year", genres: "any", decades: [2010] })).code,
      E: (await newRoom({ type: "duel", mode: "title", genres: ["pop"], decades: [1980] })).code,
    };
  });

  const cases: [Filter, (keyof typeof rooms)[]][] = [
    [{}, ["A", "B", "C", "D"]],
    [{ type: "duel" }, ["E"]],
    [{ mode: "title" }, ["A", "C"]],
    [{ mode: "artist" }, ["B"]],
    [{ mode: "year" }, ["D"]],
    [{ mode: "mixed" }, []],
    [{ genres: "pop" }, ["A", "B", "C", "D"]],
    [{ genres: "rock" }, ["A", "C", "D"]],
    [{ genres: "country" }, ["A", "D"]],
    [{ genres: "rock,country" }, ["A", "C", "D"]],
    [{ decades: "1980" }, ["A", "B", "C"]],
    [{ decades: "2010" }, ["A", "C", "D"]],
    [{ decades: "1960" }, ["A", "C"]],
    [{ decades: "1960,2010" }, ["A", "C", "D"]],
    [{ genres: "pop", decades: "2010" }, ["A", "C", "D"]],
    [{ genres: "country", decades: "1980" }, ["A"]],
    [{ mode: "title", genres: "rock", decades: "1990" }, ["A", "C"]],
    [{ type: "duel", genres: "rock" }, []],
    [{ type: "duel", mode: "title", genres: "pop,dance", decades: "1980" }, ["E"]],
    [{ type: "duel", decades: "2010" }, []],
  ];

  it.each(cases)("filter %j lists %j", async (filter, expected) => {
    expect(await listedCodes(filter)).toEqual(expected.map((letter) => rooms[letter]).sort());
  });
});

describe("GET /api/rooms – rejected filters", () => {
  const invalid: Record<string, string>[] = [
    { type: "any" },
    { type: "solo" },
    { type: "" },
    { mode: "guess" },
    { mode: "" },
    { genres: "" },
    { genres: "jazz" },
    { genres: "pop,pop" },
    { genres: "any,pop" },
    { genres: "pop," },
    { decades: "1985" },
    { decades: "80s" },
    { decades: "1980,1980" },
    { decades: "" },
    { decades: "any,1980" },
    { extra: "1" },
  ];

  it.each(invalid)("refuses %j with 400", async (filter) => {
    expect(await list(filter)).toEqual({ status: 400, body: { error: "invalid-filter", message: expect.any(String) } });
  });

  it("refuses a missing field and a repeated field with 400", async () => {
    for (const missing of ["type", "mode", "genres", "decades"]) {
      const params = new URLSearchParams(ANY);
      params.delete(missing);
      expect((await listPublicRooms(db, params, deps)).status).toBe(400);
    }
    const repeated = new URLSearchParams(ANY);
    repeated.append("genres", "pop");
    expect((await listPublicRooms(db, repeated, deps)).status).toBe(400);
  });
});
