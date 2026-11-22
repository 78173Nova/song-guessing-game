import { beforeAll, describe, expect, it } from "vitest";
import { startGame } from "@/lib/api/games";
import type { Db } from "@/lib/db/client";
import { getGameRounds } from "@/lib/db/games";
import { listSongs, savePreview, upsertSongs, type SongInput } from "@/lib/db/songs";
import { createTestDb } from "../helpers/test-db";

// Choosing songs per set and number of sets in a solo game, against PGlite. No network.
// 7 rock songs and 28 pop songs: 35 playable songs in all.
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  const songs: SongInput[] = [
    ...Array.from({ length: 7 }, (_, i) => ({ title: `Rock ${i}`, artist: `Rock Artist ${i}`, year: 1980 + i, genre: "rock" })),
    ...Array.from({ length: 28 }, (_, i) => ({ title: `Pop ${i}`, artist: `Pop Artist ${i}`, year: 1990 + (i % 10), genre: "pop" })),
  ];
  await upsertSongs(db, songs);
  for (const song of await listSongs(db)) {
    await savePreview(
      db,
      song.id,
      {
        previewUrl: `https://audio.example.com/${song.id}.m4a`,
        artworkUrl: `https://art.example.com/${song.id}.jpg`,
        storeUrl: `https://music.example.com/${song.id}`,
      },
      new Date("2026-11-10T10:00:00Z"),
    );
  }
}, 60_000);

const start = (body?: unknown) => startGame(db, Math.random, body === undefined ? "" : JSON.stringify(body));

async function started(body?: unknown) {
  const result = await start(body);
  expect(result.status).toBe(201);
  return result.body as { gameId: string; previewUrls: string[] };
}

const songIds = async (gameId: string) => (await getGameRounds(db, gameId))!.map((round) => round.songId);

describe("POST /api/games – songs per set and number of sets", () => {
  it("2 sets of 3 is a game of 6 different songs", async () => {
    const game = await started({ songsPerSet: 3, sets: 2 });
    expect(game.previewUrls).toHaveLength(6);
    expect(new Set(await songIds(game.gameId)).size).toBe(6);
  });

  it("3 sets of 10 is a game of 30 different songs", async () => {
    const game = await started({ songsPerSet: 10, sets: 3 });
    expect(game.previewUrls).toHaveLength(30);
    expect(new Set(await songIds(game.gameId)).size).toBe(30);
  });

  it("no choice is still a game of 5 songs", async () => {
    expect((await started()).previewUrls).toHaveLength(5);
    expect((await started({ mode: "artist" })).previewUrls).toHaveLength(5);
  });

  it.each([
    ["4 songs per set", { songsPerSet: 4, sets: 1 }],
    ["0 sets", { songsPerSet: 5, sets: 0 }],
    ["4 sets", { songsPerSet: 5, sets: 4 }],
    ["text", { songsPerSet: "5", sets: 1 }],
    ["a decimal", { songsPerSet: 5, sets: 1.5 }],
    ["an empty value", { songsPerSet: null, sets: 1 }],
    ["only songs per set", { songsPerSet: 5 }],
    ["only number of sets", { sets: 2 }],
  ])("refuses %s", async (_name, body) => {
    const result = await start(body);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("malformed");
  });

  it("refuses a game bigger than the matching songs, and says how many match", async () => {
    const result = await start({ genre: "rock", songsPerSet: 3, sets: 3 });
    expect(result.status).toBe(422);
    expect(result.body.error).toBe("too-few-songs");
    expect(result.body.message).toBe("Only 7 songs match. Choose fewer songs, or try 'Any' for genre or decade.");
  });

  it("the same filters still start a smaller game", async () => {
    expect((await started({ genre: "rock", songsPerSet: 5, sets: 1 })).previewUrls).toHaveLength(5);
  });

  it("a small game avoids the songs of the last game, even with only 4 others left", async () => {
    for (let i = 0; i < 10; i++) {
      const first = await started({ genre: "rock", songsPerSet: 3, sets: 1 });
      const second = await started({ genre: "rock", songsPerSet: 3, sets: 1, recentGames: [first.gameId] });
      const earlier = new Set(await songIds(first.gameId));
      expect((await songIds(second.gameId)).some((id) => earlier.has(id))).toBe(false);
    }
  });

  it("a bigger game avoids the songs of the last game too", async () => {
    const first = await started({ songsPerSet: 10, sets: 1 });
    const second = await started({ songsPerSet: 10, sets: 2, recentGames: [first.gameId] });
    const earlier = new Set(await songIds(first.gameId));
    expect((await songIds(second.gameId)).some((id) => earlier.has(id))).toBe(false);
  });

  it("the reply holds only the game ID and the clip addresses, no answers", async () => {
    const result = await start({ songsPerSet: 3, sets: 2 });
    expect(Object.keys(result.body).sort()).toEqual(["gameId", "previewUrls"]);
  });
});
