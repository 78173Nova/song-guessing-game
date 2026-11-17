import { beforeEach, describe, expect, it } from "vitest";
import { startGame } from "@/lib/api/games";
import type { Db } from "@/lib/db/client";
import { createGame, getGameRounds } from "@/lib/db/games";
import { listSongs, savePreview, upsertSongs, type Song, type SongInput } from "@/lib/db/songs";
import { createTestDb } from "../helpers/test-db";

// Avoiding the songs of the player's last 3 games, and how random the song choice is (spec 003).
// Against PGlite, no network.
let db: Db;
const deps = { now: () => new Date("2026-11-10T12:00:00.000Z") };
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

// Adds songs; those whose title contains "NoClip" get no preview.
async function addSongs(input: SongInput[]): Promise<Song[]> {
  await upsertSongs(db, input);
  for (const song of await listSongs(db)) {
    if (song.title.includes("NoClip") || song.previewUrl !== null) continue;
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
  return listSongs(db);
}

const pop = (n: number, artist = `Artist ${n}`): SongInput => ({ title: `Song ${n}`, artist, year: 2000, genre: "pop" });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// A finished earlier game with exactly these songs (so the test knows which songs to avoid).
function earlierGame(songs: Song[]): Promise<string> {
  return createGame(
    db,
    songs.map((s, i) => ({ roundNumber: i + 1, songId: s.id, options: [s.title, "W1", "W2", "W3"], correctOption: 0 })),
  );
}

async function start(body: Record<string, unknown>, random: () => number = Math.random) {
  return startGame(db, random, JSON.stringify(body), deps);
}

async function songIdsOf(result: Awaited<ReturnType<typeof start>>): Promise<number[]> {
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  const rounds = await getGameRounds(db, (result.body as { gameId: string }).gameId);
  return rounds!.map((r) => r.songId);
}

beforeEach(async () => {
  db = await createTestDb();
});

describe("POST /api/games – avoiding the songs of recent games", () => {
  it("leaves out the songs of the last game when enough songs remain", async () => {
    const songs = await addSongs(range(1, 11).map((n) => pop(n)));
    const last = await earlierGame(songs.slice(0, 5));
    for (let i = 0; i < 10; i++) {
      const ids = await songIdsOf(await start({ recentGames: [last] }));
      for (const id of ids) expect(songs.slice(0, 5).map((s) => s.id)).not.toContain(id);
    }
  });

  it("leaves out the songs of all 3 games; exactly 5 songs left is enough", async () => {
    const songs = await addSongs(range(1, 20).map((n) => pop(n)));
    const games = [
      await earlierGame(songs.slice(0, 5)),
      await earlierGame(songs.slice(5, 10)),
      await earlierGame(songs.slice(10, 15)),
    ];
    const ids = await songIdsOf(await start({ recentGames: games }));
    expect([...ids].sort((a, b) => a - b)).toEqual(songs.slice(15, 20).map((s) => s.id));
  });

  it("too few songs without all 3 games: avoids only the newest games that still leave 5", async () => {
    // 11 songs. Newest game: songs 1–5, the one before: songs 6–10. Without both, only 1 song is left,
    // so the server avoids only the newest game (6 songs left).
    const songs = await addSongs(range(1, 11).map((n) => pop(n)));
    const newest = await earlierGame(songs.slice(0, 5));
    const before = await earlierGame(songs.slice(5, 10));
    for (let i = 0; i < 10; i++) {
      const ids = await songIdsOf(await start({ recentGames: [newest, before] }));
      for (const id of ids) expect(songs.slice(0, 5).map((s) => s.id)).not.toContain(id);
    }
  });

  it("fewer than 5 songs left even without the newest game: ignores the recent games and still starts", async () => {
    const songs = await addSongs(range(1, 6).map((n) => pop(n)));
    const last = await earlierGame(songs.slice(0, 5));
    const ids = await songIdsOf(await start({ recentGames: [last] }));
    expect(ids).toHaveLength(5);
  });

  it("falls back when the remaining songs cannot fill this mode (5 songs by one artist in artist mode)", async () => {
    const songs = await addSongs([...range(1, 5).map((n) => pop(n)), ...range(6, 10).map((n) => pop(n, "One Artist"))]);
    const last = await earlierGame(songs.slice(0, 5));
    // Artist mode needs 4 different artists: without the last game there is only one, so it is not avoided.
    expect((await start({ mode: "artist", recentGames: [last] })).status).toBe(201);
    // Title mode works without the last game, so it is avoided: exactly the 5 one-artist songs.
    const ids = await songIdsOf(await start({ mode: "title", recentGames: [last] }));
    expect([...ids].sort((a, b) => a - b)).toEqual(songs.slice(5, 10).map((s) => s.id));
  });

  it("applies the genre and decade filters first: songs outside the filters never come back", async () => {
    const songs = await addSongs([
      ...range(1, 11).map((n) => ({ ...pop(n), genre: "rock", year: 1985 })),
      ...range(12, 30).map((n) => pop(n)),
    ]);
    const last = await earlierGame(songs.slice(0, 5));
    for (let i = 0; i < 10; i++) {
      const ids = await songIdsOf(await start({ genre: "rock", decade: 1980, recentGames: [last] }));
      for (const id of ids) expect(songs.slice(5, 11).map((s) => s.id)).toContain(id);
    }
  });

  it("ignores unknown game IDs: the game starts as without them", async () => {
    await addSongs(range(1, 8).map((n) => pop(n)));
    expect((await start({ recentGames: [UNKNOWN] })).status).toBe(201);
  });

  it("the reply only has the game ID and the clip addresses – nothing about the avoided songs", async () => {
    const songs = await addSongs(range(1, 11).map((n) => pop(n)));
    const last = await earlierGame(songs.slice(0, 5));
    for (const recentGames of [[last], [UNKNOWN]]) {
      const result = await start({ recentGames });
      expect(Object.keys(result.body).sort()).toEqual(["gameId", "previewUrls"]);
    }
    // Only with the known game are songs 1–5 avoided, so only then must their clips be missing.
    const text = JSON.stringify((await start({ recentGames: [last] })).body);
    for (const song of songs.slice(0, 5)) expect(text).not.toContain(song.previewUrl!);
  });
});

describe("POST /api/games – rejected recentGames", () => {
  it("rejects a wrong list and stores no game", async () => {
    await addSongs(range(1, 8).map((n) => pop(n)));
    const values = [UNKNOWN, null, 1, [1], ["abc"], [UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN], [UNKNOWN.replaceAll("-", "")]];
    for (const recentGames of values) {
      expect(await start({ recentGames }), JSON.stringify(recentGames)).toMatchObject({
        status: 400,
        body: { error: "malformed" },
      });
    }
    expect(await db.query("SELECT id FROM games")).toEqual([]);
  });
});

describe("POST /api/games – random choice over all playable songs", () => {
  // A small, repeatable random number generator, so this test gives the same result every time.
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it("without filters, every song with a clip gets played over many games, songs without a clip never", async () => {
    const songs = await addSongs([...range(1, 12).map((n) => pop(n)), { ...pop(13), title: "NoClip 13" }]);
    const random = seeded(42);
    const played = new Map<number, number>();
    for (let i = 0; i < 120; i++) {
      for (const id of await songIdsOf(await start({}, random))) played.set(id, (played.get(id) ?? 0) + 1);
    }
    const playable = songs.filter((s) => s.previewUrl !== null).map((s) => s.id);
    expect([...played.keys()].sort((a, b) => a - b)).toEqual(playable);
    // 120 games × 5 songs over 12 songs = 50 per song on average. None far off.
    for (const count of played.values()) {
      expect(count).toBeGreaterThan(25);
      expect(count).toBeLessThan(75);
    }
  });
});
