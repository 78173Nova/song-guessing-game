import { beforeEach, describe, expect, it } from "vitest";
import { answerRound, safely, sendNextRound, startGame } from "@/lib/api/games";
import type { Db } from "@/lib/db/client";
import { getGameRounds } from "@/lib/db/games";
import { MUSIC_UNAVAILABLE_MESSAGE } from "@/lib/music/itunes";
import { createTestDb } from "../helpers/test-db";
import { addTestSongs } from "../helpers/songs";

// Full requests from start to finish, against PGlite. No network.
let db: Db;
let clock: Date;
const deps = { now: () => clock };
const later = (seconds: number) => new Date(clock.getTime() + seconds * 1000);

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-10T12:00:00.000Z");
});

async function startedGame(): Promise<string> {
  await addTestSongs(db, 8);
  const result = await startGame(db);
  return (result.body as { gameId: string }).gameId;
}

async function correctOption(gameId: string, round: number): Promise<number> {
  return (await getGameRounds(db, gameId))![round - 1].correctOption;
}

const answer = (gameId: string, body: unknown) =>
  answerRound(db, gameId, typeof body === "string" ? body : JSON.stringify(body), deps);

describe("POST /api/games – start", () => {
  it("returns 201 with only the game ID", async () => {
    await addTestSongs(db, 8);
    const result = await startGame(db);

    expect(result.status).toBe(201);
    expect(Object.keys(result.body)).toEqual(["gameId"]);
    const rounds = await getGameRounds(db, (result.body as { gameId: string }).gameId);
    expect(rounds).toHaveLength(5);
  });

  it("returns 503 with the music message when fewer than 5 songs have a preview", async () => {
    await addTestSongs(db, 8, 4);
    const result = await startGame(db);

    expect(result).toEqual({
      status: 503,
      body: { error: "not-enough-songs", message: MUSIC_UNAVAILABLE_MESSAGE },
    });
    expect(await db.query("SELECT id FROM games")).toEqual([]);
  });
});

describe("POST /api/games/[id]/next", () => {
  it("sends round, totalRounds, previewUrl and options – and nothing that gives the answer away", async () => {
    const gameId = await startedGame();
    const result = await sendNextRound(db, gameId, deps);

    expect(result.status).toBe(200);
    expect(Object.keys(result.body).sort()).toEqual(["options", "previewUrl", "round", "totalRounds"]);
    const round = (await getGameRounds(db, gameId))![0];
    expect(result.body).toEqual({
      round: 1,
      totalRounds: 5,
      previewUrl: round.song.previewUrl,
      options: round.options,
    });
    expect(round.status).toBe("open");
    expect(round.startedAt).toEqual(clock);
  });

  it("refuses while the current round is open, and after the last round", async () => {
    const gameId = await startedGame();
    await sendNextRound(db, gameId, deps);
    expect(await sendNextRound(db, gameId, deps)).toMatchObject({ status: 409, body: { error: "round-still-open" } });

    for (let round = 1; round <= 5; round++) {
      if (round > 1) await sendNextRound(db, gameId, deps);
      await answer(gameId, { round, answer: 0 });
    }
    expect(await sendNextRound(db, gameId, deps)).toMatchObject({ status: 409, body: { error: "game-finished" } });
  });
});

describe("POST /api/games/[id]/answer", () => {
  it("returns correct, points, total score, the correct option and the song", async () => {
    const gameId = await startedGame();
    await sendNextRound(db, gameId, deps);
    const right = await correctOption(gameId, 1);
    clock = later(3);

    const result = await answer(gameId, { round: 1, answer: right });

    const song = (await getGameRounds(db, gameId))![0].song;
    expect(result).toEqual({
      status: 200,
      body: {
        correct: true,
        points: 140,
        totalScore: 140,
        correctOption: right,
        song: { title: song.title, artist: song.artist, artworkUrl: song.artworkUrl, storeUrl: song.storeUrl },
      },
    });
  });

  it("rejects every invalid answer with a clear error", async () => {
    const gameId = await startedGame();

    expect(await answer(gameId, { round: 1, answer: 0 })).toMatchObject({ status: 409, body: { error: "round-not-sent" } });

    await sendNextRound(db, gameId, deps);
    expect(await answer(gameId, { round: 0, answer: 0 })).toMatchObject({ status: 400, body: { error: "malformed" } });
    expect(await answer(gameId, { round: 6, answer: 0 })).toMatchObject({ status: 400, body: { error: "round-out-of-range" } });
    expect(await answer(gameId, { round: 1, answer: 7 })).toMatchObject({ status: 400, body: { error: "invalid-option" } });
    expect(await answer(gameId, "not json")).toMatchObject({ status: 400, body: { error: "malformed" } });
    expect(await answer(gameId, "")).toMatchObject({ status: 400, body: { error: "malformed" } });

    expect(await answer(gameId, { round: 1, answer: 0 })).toMatchObject({ status: 200 });
    expect(await answer(gameId, { round: 1, answer: 1 })).toMatchObject({ status: 409, body: { error: "already-answered" } });

    const unknown = "00000000-0000-4000-8000-000000000000";
    expect(await answer(unknown, { round: 1, answer: 0 })).toMatchObject({ status: 404, body: { error: "game-not-found" } });
    expect(await answer("not-a-uuid", { round: 1, answer: 0 })).toMatchObject({ status: 404, body: { error: "game-not-found" } });
    expect(await sendNextRound(db, "not-a-uuid", deps)).toMatchObject({ status: 404, body: { error: "game-not-found" } });
  });

  it("every error has a human-readable message", async () => {
    const gameId = await startedGame();
    const result = await answer(gameId, { round: 1, answer: 0 });
    expect(typeof (result.body as { message: unknown }).message).toBe("string");
    expect((result.body as { message: string }).message.length).toBeGreaterThan(0);
  });

  it("records a skip with 0 points, returns the song, and lets the game continue", async () => {
    const gameId = await startedGame();
    await sendNextRound(db, gameId, deps);

    const result = await answer(gameId, { round: 1, answer: "skip" });

    expect(result).toMatchObject({ status: 200, body: { correct: false, points: 0, totalScore: 0 } });
    expect((result.body as { song: { title: string } }).song.title).toBeTruthy();
    expect((await getGameRounds(db, gameId))![0].status).toBe("skipped");
    expect(await sendNextRound(db, gameId, deps)).toMatchObject({ status: 200, body: { round: 2 } });
  });
});

describe("a whole game", () => {
  it("plays 5 rounds; the total score is the sum of the round points", async () => {
    const gameId = await startedGame();
    const seconds = [0, 3, 7.5, 20, 1]; // round 4 is too late → 0 points
    let total = 0;

    for (let round = 1; round <= 5; round++) {
      clock = new Date("2026-11-10T12:00:00.000Z");
      expect(await sendNextRound(db, gameId, deps)).toMatchObject({ status: 200, body: { round } });
      const right = await correctOption(gameId, round);
      clock = later(seconds[round - 1]);
      const result = await answer(gameId, { round, answer: right });
      const body = result.body as { points: number; totalScore: number };
      total += body.points;
      expect(body.totalScore).toBe(total);
    }

    expect(total).toBe(150 + 140 + 125 + 0 + 147);
    expect(await sendNextRound(db, gameId, deps)).toMatchObject({ status: 409, body: { error: "game-finished" } });
  });
});

describe("safely", () => {
  it("turns a database failure into a 500 with a generic message", async () => {
    const brokenDb: Db = {
      async query() {
        throw new Error("connection to secret-host.neon.tech failed");
      },
    };

    const result = await safely(() => startGame(brokenDb));

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "server-error", message: expect.any(String) });
    expect(JSON.stringify(result.body)).not.toContain("secret-host");
  });

  it("also catches errors thrown before the request starts (e.g. missing DATABASE_URL)", async () => {
    const result = await safely(() => {
      throw new Error("DATABASE_URL is not set");
    });
    expect(result.status).toBe(500);
  });
});
