import { beforeEach, describe, expect, it } from "vitest";
import {
  answerRoomRound,
  countMatchingSongs,
  createNewRoom,
  getRoomState,
  joinRoom,
  replaceRoomSong,
  startRoomGame,
} from "@/lib/api/rooms";
import type { TransactionDb } from "@/lib/db/client";
import { getGameRounds } from "@/lib/db/games";
import { listSongs, savePreview, upsertSongs } from "@/lib/db/songs";
import { loggedInSession } from "../helpers/session";
import { createTestDb } from "../helpers/test-db";

// Room settings, sets and set summaries (issue #34), through the room API against PGlite. No network.
// The clock only moves when a test moves it.
let db: TransactionDb;
let clock: Date;
let nextCode: number;
let session: string;
const deps = { now: () => clock };
const START = new Date("2026-11-15T12:00:00.000Z");

// The test catalogue: 32 songs with a clip, in these groups (genre, first year, how many).
// Every title and artist is different, so every mode can be played.
const GROUPS = [
  { genre: "pop", year: 1981, count: 6 },
  { genre: "rock", year: 1991, count: 6 },
  { genre: "hip-hop", year: 2001, count: 6 },
  { genre: "pop", year: 2011, count: 6 },
  { genre: "country", year: 1971, count: 3 },
  { genre: "pop", year: 2021, count: 5 },
];

async function addCatalogue() {
  const input = GROUPS.flatMap((group) =>
    Array.from({ length: group.count }, (_, i) => ({
      title: `${group.genre} ${group.year} title ${i + 1}`,
      artist: `${group.genre} ${group.year} artist ${i + 1}`,
      year: group.year + i,
      genre: group.genre,
    })),
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

const bearer = (token: string) => `Bearer ${token}`;
const plus = (time: Date | string, seconds: number) => new Date(new Date(time).getTime() + seconds * 1000).toISOString();

type Settings = {
  type: string;
  mode: string;
  genres: unknown;
  decades: unknown;
  songsPerSet: unknown;
  sets: unknown;
};
const DEFAULTS: Settings = { type: "multiplayer", mode: "title", genres: "any", decades: "any", songsPerSet: 5, sets: 1 };

const create = (body: unknown) =>
  createNewRoom(db, session, JSON.stringify(body), { ...deps, newCode: () => String(nextCode++) });
const state = (code: string, token: string) => getRoomState(db, code, bearer(token), deps);

async function newRoom(settings: Partial<Settings>, creator = "Anna") {
  const result = await create({ nickname: creator, settings: { ...DEFAULTS, ...settings } });
  if (result.status !== 201) throw new Error(`Test setup: the room was not created (${JSON.stringify(result.body)})`);
  const { code, playerToken } = result.body as { code: string; playerToken: string };
  return { code, creatorToken: playerToken };
}

async function joined(code: string, nickname: string): Promise<string> {
  wait(0.001);
  const result = await joinRoom(db, code, JSON.stringify({ nickname }), deps);
  if (result.status !== 201) throw new Error(`Test setup: ${nickname} could not join`);
  return (result.body as { playerToken: string }).playerToken;
}

async function roundsOf(code: string) {
  const [{ game_id }] = await db.query<{ game_id: string }>("SELECT game_id FROM rooms WHERE code = $1", [code]);
  return (await getGameRounds(db, game_id))!;
}

const roomCount = async () => (await db.query("SELECT id FROM rooms")).length;

describe("POST /api/rooms – room settings", () => {
  it("accepts every allowed value of every setting and shows the settings in the lobby", async () => {
    const variants: Partial<Settings>[] = [
      { type: "duel" },
      { type: "multiplayer" },
      { mode: "title" },
      { mode: "artist" },
      { mode: "year" },
      { mode: "mixed" },
      { genres: ["pop"] },
      { genres: ["pop", "rock", "hip-hop", "country"] },
      { decades: [1980] },
      { decades: [1980, 1990, 2000, 2010, 2020] },
      { songsPerSet: 3 },
      { songsPerSet: 10 },
      { sets: 2 },
      { sets: 3 },
      { songsPerSet: 10, sets: 3 },
    ];
    for (const variant of variants) {
      const room = await newRoom(variant);
      const lobby = await state(room.code, room.creatorToken);
      expect(lobby.body.settings).toEqual({ ...DEFAULTS, ...variant });
    }
  });

  it("refuses a create request without settings with 400, and creates no room", async () => {
    expect(await create({ nickname: "Anna" })).toMatchObject({ status: 400, body: { error: "invalid-settings" } });
    expect(await create({ nickname: "Anna", private: true })).toMatchObject({ status: 400, body: { error: "invalid-settings" } });
    expect(await db.query("SELECT id FROM rooms")).toEqual([]);
  });

  it("refuses unknown values, wrong types, missing and extra fields with 400, and creates no room", async () => {
    const bad: unknown[] = [
      null,
      "duel",
      [],
      {},
      { ...DEFAULTS, type: "trio" },
      { ...DEFAULTS, type: 2 },
      { ...DEFAULTS, mode: "lyrics" },
      { ...DEFAULTS, mode: "Title" },
      { ...DEFAULTS, genres: "all" },
      { ...DEFAULTS, genres: "pop" },
      { ...DEFAULTS, genres: [] },
      { ...DEFAULTS, genres: ["jazz"] },
      { ...DEFAULTS, genres: ["pop", "pop"] },
      { ...DEFAULTS, genres: ["pop", 1] },
      { ...DEFAULTS, decades: [1985] },
      { ...DEFAULTS, decades: ["1980"] },
      { ...DEFAULTS, decades: [1950] },
      { ...DEFAULTS, decades: [] },
      { ...DEFAULTS, decades: [1980, 1980] },
      { ...DEFAULTS, songsPerSet: 4 },
      { ...DEFAULTS, songsPerSet: "5" },
      { ...DEFAULTS, sets: 0 },
      { ...DEFAULTS, sets: 4 },
      { ...DEFAULTS, sets: null },
      { ...DEFAULTS, public: true },
      { type: "duel", mode: "title", genres: "any", decades: "any", songsPerSet: 5 },
    ];
    for (const settings of bad) {
      expect(await create({ nickname: "Anna", settings })).toMatchObject({
        status: 400,
        body: { error: "invalid-settings" },
      });
    }
    expect(await create({ nickname: "Anna", settings: DEFAULTS, extra: 1 })).toMatchObject({
      status: 400,
      body: { error: "malformed" },
    });
    expect(await roomCount()).toBe(0);
  });

  it("refuses too few matching songs with the count in the message, and creates no room", async () => {
    // 17 pop songs, 30 needed.
    const result = await create({ nickname: "Anna", settings: { ...DEFAULTS, genres: ["pop"], songsPerSet: 10, sets: 3 } });
    expect(result).toEqual({
      status: 422,
      body: {
        error: "too-few-songs",
        matching: 17,
        message: "Only 17 songs match. Choose fewer songs or more genres/decades.",
      },
    });
    // 3 country songs from the 1970s, 5 needed.
    expect((await create({ nickname: "Anna", settings: { ...DEFAULTS, genres: ["country"] } })).body).toMatchObject({
      matching: 3,
      message: "Only 3 songs match. Choose fewer songs or more genres/decades.",
    });
    // Country from the 1980s: none.
    expect(
      (await create({ nickname: "Anna", settings: { ...DEFAULTS, genres: ["country"], decades: [1980] } })).body,
    ).toMatchObject({ matching: 0 });
    expect(await roomCount()).toBe(0);
  });
});

describe("GET /api/rooms/matching-songs – how many songs match while choosing", () => {
  const count = (query: string) => countMatchingSongs(db, new URLSearchParams(query));

  it("counts the songs that match one of the genres and one of the decades", async () => {
    expect(await count("genres=any&decades=any")).toEqual({ status: 200, body: { count: 32 } });
    expect(await count("genres=pop&decades=any")).toEqual({ status: 200, body: { count: 17 } });
    // pop 1980s (6) + rock 1990s (6); not pop 2010s, not rock outside the 1980s/1990s.
    expect(await count("genres=pop,rock&decades=1980,1990")).toEqual({ status: 200, body: { count: 12 } });
    expect(await count("genres=country&decades=1980")).toEqual({ status: 200, body: { count: 0 } });
  });

  it("refuses unknown genres and decades and missing values with 400", async () => {
    for (const query of ["", "genres=any", "decades=any", "genres=jazz&decades=any", "genres=any&decades=1985", "genres=&decades=any", "genres=pop,pop&decades=any"]) {
      expect(await count(query)).toMatchObject({ status: 400, body: { error: "invalid-settings" } });
    }
  });
});

describe("room type: Duel and Multiplayer", () => {
  it("starts a Duel by itself when the second player joins, and refuses a third player", async () => {
    const room = await newRoom({ type: "duel" });
    expect((await state(room.code, room.creatorToken)).body.status).toBe("lobby");

    await joined(room.code, "Ben");
    const after = await state(room.code, room.creatorToken);
    expect(after.body.status).toBe("playing");
    expect(after.body.nextRound).toMatchObject({ number: 1, startsAt: plus(clock, 5) });

    const third = await joinRoom(db, room.code, JSON.stringify({ nickname: "Cleo" }), deps);
    expect(third.status).toBe(409);
  });

  it("starts a full Multiplayer room (25 players) by itself, and not before", async () => {
    const room = await newRoom({ type: "multiplayer" });
    for (let n = 2; n <= 24; n++) await joined(room.code, `Player ${n}`);
    expect((await state(room.code, room.creatorToken)).body.status).toBe("lobby");

    await joined(room.code, "Player 25");
    expect((await state(room.code, room.creatorToken)).body.status).toBe("playing");
  });
});

describe("songs played match the settings", () => {
  it("plays sets × songs per set different songs, each from a chosen genre and a chosen decade", async () => {
    const room = await newRoom({ genres: ["pop", "rock"], decades: [1980, 1990], songsPerSet: 3, sets: 3 });
    await joined(room.code, "Ben");
    const started = await startRoomGame(db, room.code, bearer(room.creatorToken), deps);
    expect(started.status).toBe(200);
    expect((started.body.previewUrls as string[]).length).toBe(9);

    const rounds = await roundsOf(room.code);
    expect(rounds).toHaveLength(9);
    expect(new Set(rounds.map((round) => round.songId)).size).toBe(9);
    for (const round of rounds) {
      // Only pop from the 1980s and rock from the 1990s exist in these genres and decades.
      expect(round.song.title).toMatch(/^(pop 1981|rock 1991) title/);
    }
    expect((await state(room.code, room.creatorToken)).body.totalRounds).toBe(9);
  });

  it("asks the room's mode: an artist room shows artists as options", async () => {
    const room = await newRoom({ mode: "artist" });
    await joined(room.code, "Ben");
    await startRoomGame(db, room.code, bearer(room.creatorToken), deps);

    const next = (await state(room.code, room.creatorToken)).body.nextRound as { questionType: string; options: string[] };
    expect(next.questionType).toBe("artist");
    for (const option of next.options) expect(option).toMatch(/ artist \d+$/);
  });
});

type NextRound = { number: number; startsAt: string };

describe("song swap keeps the settings", () => {
  it("gives a swapped round a song from the chosen genres and decades, with options of the room's mode", async () => {
    const room = await newRoom({ mode: "artist", genres: ["pop", "rock"], decades: [1980, 1990] });
    const ben = await joined(room.code, "Ben");
    await startRoomGame(db, room.code, bearer(room.creatorToken), deps);
    const before = (await roundsOf(room.code))[1];

    const swapped = await replaceRoomSong(db, room.code, bearer(ben), JSON.stringify({ round: 2 }), deps);
    expect(swapped.status).toBe(200);
    const after = (await roundsOf(room.code))[1];
    expect(after.songId).not.toBe(before.songId);
    expect(after.song.title).toMatch(/^(pop 1981|rock 1991) title/);
    expect(after.options).toContain(after.song.artist);
  });
});

describe("sets: the break after each set", () => {
  it("starts the next round 8 s after a close within a set, and 23 s after the close of a set's last round", async () => {
    const room = await newRoom({ songsPerSet: 3, sets: 2 });
    const ben = await joined(room.code, "Ben");
    await startRoomGame(db, room.code, bearer(room.creatorToken), deps);

    // Nobody answers: each round closes after its 15 seconds.
    const starts: string[] = [];
    for (let n = 1; n <= 4; n++) {
      const next = (await state(room.code, ben)).body.nextRound as NextRound;
      expect(next.number).toBe(n);
      starts.push(next.startsAt);
      clock = new Date(plus(next.startsAt, 15.001));
    }
    expect(starts[1]).toBe(plus(starts[0], 15 + 8));
    expect(starts[2]).toBe(plus(starts[1], 15 + 8));
    // Round 3 ends set 1: result 5 s + set summary 10 s + standings 5 s + 3 s.
    expect(starts[3]).toBe(plus(starts[2], 15 + 23));
  });
});

type SummaryItem = { round: number; set: number; title: string; artist: string; storeUrl: string; correct: boolean; points: number };

describe("set summary in the room state", () => {
  it("lists each closed round for this player: title, artist, right/wrong, points and the song's link", async () => {
    const room = await newRoom({ songsPerSet: 3, sets: 2 });
    const ben = await joined(room.code, "Ben");
    await startRoomGame(db, room.code, bearer(room.creatorToken), deps);
    const answer = (token: string, round: number, option: number) =>
      answerRoomRound(db, room.code, bearer(token), JSON.stringify({ round, answer: option }), deps);

    const next = (await state(room.code, ben)).body.nextRound as NextRound;
    clock = new Date(plus(next.startsAt, 3));
    const [round1] = await roundsOf(room.code);
    expect((await answer(room.creatorToken, 1, round1.correctOption)).status).toBe(200);
    // Open round: not in the summary yet.
    expect(((await state(room.code, ben)).body.me as { summary: SummaryItem[] }).summary).toEqual([]);
    expect((await answer(ben, 1, (round1.correctOption + 1) % 4)).status).toBe(200);

    const anna = (await state(room.code, room.creatorToken)).body.me as { summary: SummaryItem[] };
    const song = { title: round1.song.title, artist: round1.song.artist, storeUrl: round1.song.storeUrl };
    expect(anna.summary).toEqual([{ round: 1, set: 1, ...song, correct: true, points: 140 }]);
    const benMe = (await state(room.code, ben)).body.me as { summary: SummaryItem[] };
    expect(benMe.summary).toEqual([{ round: 1, set: 1, ...song, correct: false, points: 0 }]);
  });

  it("covers every song of the game once the room has finished, with the set of each round", async () => {
    const room = await newRoom({ songsPerSet: 3, sets: 2 });
    const ben = await joined(room.code, "Ben");
    await startRoomGame(db, room.code, bearer(room.creatorToken), deps);
    wait(3 * 60); // nobody answers; the game catches up on the next request (its 6 rounds end after 150 s, the vote on
    // "Play again" runs until 220 s, then the room closes because nobody chose it, issue #43)

    const final = await state(room.code, ben);
    expect(final.body.status).toBe("finished");
    const summary = (final.body.me as { summary: SummaryItem[] }).summary;
    expect(summary.map((item) => [item.round, item.set])).toEqual([
      [1, 1], [2, 1], [3, 1], [4, 2], [5, 2], [6, 2],
    ]);
    const rounds = await roundsOf(room.code);
    expect(summary.map((item) => item.storeUrl)).toEqual(rounds.map((round) => round.song.storeUrl));
    expect(summary.every((item) => item.correct === false && item.points === 0)).toBe(true);
  });
});
