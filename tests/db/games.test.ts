import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { createGame, getGameRounds, markRoundSent, saveAnswer } from "@/lib/db/games";
import { listSongsWithPreview, type Song } from "@/lib/db/songs";
import type { NewRound } from "@/lib/game/rounds";
import { createTestDb } from "../helpers/test-db";
import { addTestSongs } from "../helpers/songs";

let db: Db;
let songs: Song[];

const NOW = new Date("2026-11-10T12:00:00.000Z");

beforeEach(async () => {
  db = await createTestDb();
  songs = await addTestSongs(db, 6);
});

function newRounds(count = 5): NewRound[] {
  return songs.slice(0, count).map((song, i) => ({
    roundNumber: i + 1,
    songId: song.id,
    options: [song.title, "Wrong A", "Wrong B", "Wrong C"],
    correctOption: 0,
  }));
}

describe("createGame / getGameRounds", () => {
  it("stores the game and its 5 waiting rounds and returns a UUID", async () => {
    const gameId = await createGame(db, newRounds());
    expect(gameId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const rounds = await getGameRounds(db, gameId);
    expect(rounds).toHaveLength(5);
    expect(rounds![0]).toEqual({
      roundNumber: 1,
      songId: songs[0].id,
      options: [songs[0].title, "Wrong A", "Wrong B", "Wrong C"],
      correctOption: 0,
      status: "waiting",
      startedAt: null,
      answeredAt: null,
      chosenOption: null,
      points: null,
      song: {
        title: songs[0].title,
        artist: songs[0].artist,
        previewUrl: songs[0].previewUrl,
        artworkUrl: songs[0].artworkUrl,
        storeUrl: songs[0].storeUrl,
      },
    });
    expect(rounds!.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns null for an unknown game", async () => {
    expect(await getGameRounds(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("markRoundSent", () => {
  it("opens a waiting round once, and does nothing the second time", async () => {
    const gameId = await createGame(db, newRounds());

    expect(await markRoundSent(db, gameId, 1, NOW)).toBe(true);
    expect(await markRoundSent(db, gameId, 1, new Date("2026-11-10T13:00:00Z"))).toBe(false);

    const round = (await getGameRounds(db, gameId))![0];
    expect(round.status).toBe("open");
    expect(round.startedAt).toEqual(NOW);
  });
});

describe("saveAnswer", () => {
  const answer = { status: "answered" as const, chosenOption: 0, points: 140, answeredAt: NOW };

  it("only saves on an open round, and only once", async () => {
    const gameId = await createGame(db, newRounds());

    expect(await saveAnswer(db, gameId, 1, answer)).toBe(false); // still waiting
    await markRoundSent(db, gameId, 1, NOW);
    expect(await saveAnswer(db, gameId, 1, answer)).toBe(true);
    expect(await saveAnswer(db, gameId, 1, { ...answer, chosenOption: 1, points: 0 })).toBe(false);

    const round = (await getGameRounds(db, gameId))![0];
    expect(round).toMatchObject({ status: "answered", chosenOption: 0, points: 140, answeredAt: NOW });
  });

  it("lets only one of two answers arriving at the same moment through", async () => {
    const gameId = await createGame(db, newRounds());
    await markRoundSent(db, gameId, 1, NOW);

    const results = await Promise.all([
      saveAnswer(db, gameId, 1, answer),
      saveAnswer(db, gameId, 1, { ...answer, chosenOption: 1, points: 0 }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("rounds table rules", () => {
  async function insertRound(values: Record<string, unknown>) {
    const [{ id }] = await db.query<{ id: string }>("INSERT INTO games DEFAULT VALUES RETURNING id");
    const row = {
      round_number: 1,
      song_id: songs[0].id,
      options: ["A", "B", "C", "D"],
      correct_option: 0,
      status: "waiting",
      started_at: null,
      ...values,
    };
    return db.query(
      `INSERT INTO rounds (game_id, round_number, song_id, options, correct_option, status, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, row.round_number, row.song_id, row.options, row.correct_option, row.status, row.started_at],
    );
  }

  it("accepts a valid round", async () => {
    await expect(insertRound({})).resolves.toBeDefined();
  });

  it("rejects options that are not exactly 4", async () => {
    await expect(insertRound({ options: ["A", "B", "C"] })).rejects.toThrow();
    await expect(insertRound({ options: ["A", "B", "C", "D", "E"] })).rejects.toThrow();
  });

  it("rejects an unknown status", async () => {
    await expect(insertRound({ status: "won" })).rejects.toThrow();
  });

  it("rejects an answered round without started_at", async () => {
    await expect(insertRound({ status: "answered", started_at: null })).rejects.toThrow();
  });

  it("rejects the same song twice in one game", async () => {
    const rounds = newRounds(2);
    rounds[1].songId = rounds[0].songId;
    await expect(createGame(db, rounds)).rejects.toThrow();
  });
});

describe("listSongsWithPreview", () => {
  it("returns only songs with a cached preview", async () => {
    const fresh = await createTestDb();
    await addTestSongs(fresh, 4, 2);
    const titles = (await listSongsWithPreview(fresh)).map((s) => s.title);
    expect(titles).toEqual(["Song 1", "Song 2"]);
  });
});
