import { beforeEach, describe, expect, it } from "vitest";
import { answerRound, replaceRoundSong, sendNextRound, startGame } from "@/lib/api/games";
import type { Db } from "@/lib/db/client";
import { getGameRounds, getQuestionTypes } from "@/lib/db/games";
import { createTestDb } from "../helpers/test-db";
import { addTestSongs } from "../helpers/songs";

// Game modes from start to finish, against PGlite (spec 003). No network.
let db: Db;
let clock: Date;
const deps = { now: () => clock };

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-10T12:00:00.000Z");
  await addTestSongs(db, 8); // "Song 1" by "Artist 1", ..., all from 2000
});

const start = (body: unknown) =>
  startGame(db, Math.random, typeof body === "string" ? body : JSON.stringify(body), deps);

async function startedGame(mode: string): Promise<string> {
  const result = await start({ mode });
  expect(result.status).toBe(201);
  return (result.body as { gameId: string }).gameId;
}

async function storedMode(gameId: string): Promise<string> {
  const [game] = await db.query<{ mode: string }>("SELECT mode FROM games WHERE id = $1", [gameId]);
  return game.mode;
}

describe("POST /api/games – choosing a mode", () => {
  it("starts a game in each mode and stores the mode and the question type of every round", async () => {
    const expectedTypes: Record<string, string[]> = { title: ["title"], artist: ["artist"], year: ["year"] };
    for (const mode of ["title", "artist", "year"]) {
      const gameId = await startedGame(mode);
      expect(await storedMode(gameId)).toBe(mode);
      expect(new Set(await getQuestionTypes(db, gameId))).toEqual(new Set(expectedTypes[mode]));
    }
    const mixed = await startedGame("mixed");
    expect(await storedMode(mixed)).toBe("mixed");
    for (const type of (await getQuestionTypes(db, mixed))!) expect(["title", "artist", "year"]).toContain(type);
  });

  it("uses title mode when the body is empty or has no mode", async () => {
    for (const body of ["", "{}"]) {
      const result = await start(body);
      expect(result.status).toBe(201);
      const gameId = (result.body as { gameId: string }).gameId;
      expect(await storedMode(gameId)).toBe("title");
      expect(await getQuestionTypes(db, gameId)).toEqual(["title", "title", "title", "title", "title"]);
    }
  });

  it("replies with the same fields in every mode: game ID and clip addresses, nothing else", async () => {
    for (const mode of ["title", "artist", "year", "mixed"]) {
      const result = await start({ mode });
      expect(Object.keys(result.body).sort()).toEqual(["gameId", "previewUrls"]);
    }
  });

  it("rejects an unknown mode with a clear error and stores no game", async () => {
    for (const mode of ["songs", "Title", "", "x".repeat(500)]) {
      expect(await start({ mode })).toEqual({
        status: 400,
        body: { error: "invalid-mode", message: expect.any(String) },
      });
    }
    expect(await db.query("SELECT id FROM games")).toEqual([]);
  });

  it("rejects wrong types, unknown fields, broken JSON and very long bodies, and stores no game", async () => {
    const bodies = [
      "not json",
      "null",
      "[]",
      '"title"',
      { mode: 1 },
      { mode: ["title"] },
      { mode: null },
      { mode: "title", rounds: 50 },
      JSON.stringify({ mode: "title", padding: "x".repeat(2000) }),
    ];
    for (const body of bodies) {
      expect(await start(body), String(body)).toMatchObject({ status: 400, body: { error: "malformed" } });
    }
    expect(await db.query("SELECT id FROM games")).toEqual([]);
  });
});

describe("POST /api/games/[id]/next – other modes", () => {
  it("artist mode: the options are artists, and nothing gives the answer or the title away", async () => {
    const gameId = await startedGame("artist");
    const result = await sendNextRound(db, gameId, deps);
    const round = (await getGameRounds(db, gameId))![0];

    expect(result.status).toBe(200);
    expect(Object.keys(result.body)).not.toContain("correctOption");
    const options = (result.body as { options: string[] }).options;
    expect(options).toContain(round.song.artist);
    for (const option of options) expect(option).toMatch(/^Artist \d$/);
    expect(JSON.stringify(result.body)).not.toContain(round.song.title);
  });

  it("year mode: the options are 4 years, and neither title nor artist is sent", async () => {
    const gameId = await startedGame("year");
    const result = await sendNextRound(db, gameId, deps);
    const round = (await getGameRounds(db, gameId))![0];

    const options = (result.body as { options: string[] }).options;
    expect(options).toContain("2000");
    for (const option of options) expect(option).toMatch(/^\d{4}$/);
    const text = JSON.stringify(result.body);
    expect(text).not.toContain(round.song.title);
    expect(text).not.toContain(round.song.artist);
    expect(Object.keys(result.body)).not.toContain("correctOption");
  });
});

describe("POST /api/games/[id]/answer – other modes", () => {
  it("scores artist and year answers exactly like title answers", async () => {
    for (const mode of ["artist", "year"]) {
      const gameId = await startedGame(mode);
      await sendNextRound(db, gameId, deps);
      const right = (await getGameRounds(db, gameId))![0].correctOption;
      const result = await answerRound(db, gameId, JSON.stringify({ round: 1, answer: right }), {
        now: () => new Date(clock.getTime() + 3000),
      });
      expect(result).toMatchObject({ status: 200, body: { correct: true, points: 140, correctOption: right } });
    }
  });
});

describe("POST /api/games/[id]/replace – other modes", () => {
  it("a replaced round keeps its question type and gets options of that type", async () => {
    for (const mode of ["artist", "year"]) {
      const gameId = await startedGame(mode);
      const result = await replaceRoundSong(db, gameId, JSON.stringify({ round: 3 }), Math.random, deps);
      expect(result.status).toBe(200);

      expect((await getQuestionTypes(db, gameId))![2]).toBe(mode);
      const round = (await getGameRounds(db, gameId))![2];
      const expected = mode === "artist" ? round.song.artist : "2000";
      expect(round.options[round.correctOption]).toBe(expected);
      expect(new Set(round.options).size).toBe(4);
    }
  });

  it("in a mixed game, each replaced round keeps the type it had", async () => {
    const gameId = await startedGame("mixed");
    const before = (await getQuestionTypes(db, gameId))!;
    for (let round = 1; round <= 3; round++) {
      await replaceRoundSong(db, gameId, JSON.stringify({ round }), Math.random, deps);
    }
    expect(await getQuestionTypes(db, gameId)).toEqual(before);
  });
});
