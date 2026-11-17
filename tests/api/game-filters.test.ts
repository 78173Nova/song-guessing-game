import { beforeEach, describe, expect, it } from "vitest";
import { replaceRoundSong, sendNextRound, startGame } from "@/lib/api/games";
import type { Db } from "@/lib/db/client";
import { getGameFilters, getGameRounds, getQuestionTypes } from "@/lib/db/games";
import { listSongs, savePreview, upsertSongs, type SongInput } from "@/lib/db/songs";
import { createTestDb } from "../helpers/test-db";

// Genre and decade filters from start to finish, against PGlite (spec 003, step 5). No network.
let db: Db;
let clock: Date;
const deps = { now: () => clock };

// Song groups: title prefix, genre, years, and one shared artist if given. "NoClip" songs get no preview.
const GROUPS: { name: string; genre: string; years: number[]; artist?: string }[] = [
  { name: "Rock80", genre: "rock", years: [1980, 1981, 1983, 1985, 1987, 1989] }, // 6 matching rock + 1980s
  { name: "Rock90", genre: "rock", years: [1991, 1993, 1995] },
  { name: "Pop80", genre: "pop", years: [1982, 1984, 1986] },
  { name: "Pop90", genre: "pop", years: [1990, 1992, 1994, 1996] },
  { name: "Dance10", genre: "dance", years: [2011, 2012, 2013, 2014, 2015] }, // exactly 5
  { name: "HipHop00", genre: "hip-hop", years: [2001, 2002, 2003] }, // only 3
  { name: "Country70", genre: "country", years: [1971, 1972, 1973, 1974, 1975], artist: "One Artist" },
  { name: "Rock80NoClip", genre: "rock", years: [1984] }, // never playable
  { name: "Rock60NoClip", genre: "rock", years: [1965] },
];

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-10T12:00:00.000Z");
  const input: SongInput[] = GROUPS.flatMap((g) =>
    g.years.map((year, i) => ({
      title: `${g.name} Song ${i + 1}`,
      artist: g.artist ?? `${g.name} Artist ${i + 1}`,
      year,
      genre: g.genre,
    })),
  );
  await upsertSongs(db, input);
  const stored = await listSongs(db);
  for (const song of stored) {
    if (song.title.includes("NoClip")) continue;
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
});

const start = (body: unknown) =>
  startGame(db, Math.random, typeof body === "string" ? body : JSON.stringify(body), deps);

async function startedGame(body: Record<string, unknown>): Promise<string> {
  const result = await start(body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return (result.body as { gameId: string }).gameId;
}

// Genre and year of every song in the game, looked up in the songs table.
async function songsInGame(gameId: string) {
  const rounds = (await getGameRounds(db, gameId))!;
  const all = await listSongs(db);
  return rounds.map((r) => all.find((s) => s.id === r.songId)!);
}

async function gameCount(): Promise<number> {
  return (await db.query("SELECT id FROM games")).length;
}

describe("POST /api/games – with filters", () => {
  it("rock + 1980s: every song is a rock song from 1980–1989 with a clip", async () => {
    for (let i = 0; i < 10; i++) {
      const gameId = await startedGame({ genre: "rock", decade: 1980 });
      for (const song of await songsInGame(gameId)) {
        expect(song.genre).toBe("rock");
        expect(song.year).toBeGreaterThanOrEqual(1980);
        expect(song.year).toBeLessThanOrEqual(1989);
        expect(song.previewUrl).not.toBeNull();
      }
    }
  });

  it("the wrong title options come from the matching songs too", async () => {
    for (let i = 0; i < 10; i++) {
      const gameId = await startedGame({ genre: "rock", decade: 1980 });
      for (const round of (await getGameRounds(db, gameId))!) {
        for (const option of round.options) expect(option).toMatch(/^Rock80 Song \d$/);
      }
    }
  });

  it("artist mode: the wrong artists come from the matching songs", async () => {
    const gameId = await startedGame({ mode: "artist", genre: "rock", decade: 1980 });
    for (const round of (await getGameRounds(db, gameId))!) {
      for (const option of round.options) expect(option).toMatch(/^Rock80 Artist \d$/);
    }
  });

  it("only a genre: songs from every decade of that genre", async () => {
    const gameId = await startedGame({ genre: "pop" });
    for (const song of await songsInGame(gameId)) expect(song.genre).toBe("pop");
  });

  it("only a decade: songs from every genre of that decade", async () => {
    const gameId = await startedGame({ decade: 1990 });
    for (const song of await songsInGame(gameId)) {
      expect(song.year).toBeGreaterThanOrEqual(1990);
      expect(song.year).toBeLessThanOrEqual(1999);
    }
  });

  it("stores the filters on the game; without filters nothing is stored", async () => {
    const filtered = await startedGame({ mode: "year", genre: "rock", decade: 1980 });
    expect(await getGameFilters(db, filtered)).toEqual({ genre: "rock", decade: 1980 });
    const any = await startedGame({});
    expect(await getGameFilters(db, any)).toEqual({});
  });

  it("works with exactly 5 matching songs", async () => {
    const gameId = await startedGame({ genre: "dance", decade: 2010 });
    expect(new Set((await songsInGame(gameId)).map((s) => s.genre))).toEqual(new Set(["dance"]));
  });

  it("replies with the same fields as without filters: game ID and clip addresses", async () => {
    const result = await start({ genre: "rock", decade: 1980 });
    expect(Object.keys(result.body).sort()).toEqual(["gameId", "previewUrls"]);
  });
});

describe("POST /api/games – too few matching songs", () => {
  it("fewer than 5 songs: a clear message with the number, and no game is stored", async () => {
    expect(await start({ genre: "hip-hop" })).toEqual({
      status: 422,
      body: { error: "too-few-songs", message: "Only 3 songs match these filters – try 'Any' for genre or decade." },
    });
    expect(await gameCount()).toBe(0);
  });

  it("no matching songs at all; songs without a clip do not count", async () => {
    expect(await start({ genre: "rock", decade: 1960 })).toEqual({
      status: 422,
      body: { error: "too-few-songs", message: "No songs match these filters – try 'Any' for genre or decade." },
    });
    expect(await gameCount()).toBe(0);
  });

  it("5 songs by one artist: artist and mixed mode are refused, title and year mode work", async () => {
    for (const mode of ["artist", "mixed"]) {
      const result = await start({ mode, genre: "country", decade: 1970 });
      expect(result, mode).toMatchObject({ status: 422, body: { error: "too-few-songs" } });
      expect((result.body as { message: string }).message).toContain("too few different titles or artists");
    }
    expect(await gameCount()).toBe(0);
    for (const mode of ["title", "year"]) await startedGame({ mode, genre: "country", decade: 1970 });
  });
});

describe("POST /api/games – rejected filters", () => {
  it("rejects an unknown genre or decade with a clear error and stores no game", async () => {
    for (const genre of ["Rock", "soul", "", "x".repeat(500)]) {
      expect(await start({ genre }), genre).toEqual({
        status: 400,
        body: { error: "invalid-genre", message: expect.any(String) },
      });
    }
    for (const decade of [1950, 2030, 1985, 1980.5]) {
      expect(await start({ decade }), String(decade)).toEqual({
        status: 400,
        body: { error: "invalid-decade", message: expect.any(String) },
      });
    }
    expect(await gameCount()).toBe(0);
  });

  it("rejects wrong types and unknown fields as malformed and stores no game", async () => {
    const bodies = [
      { decade: "1980" },
      { decade: [1980] },
      { genre: ["rock"] },
      { genre: 1 },
      { genre: null },
      { genre: "rock", decade: 1980, era: "80s" },
      JSON.stringify({ genre: "rock", padding: "x".repeat(2000) }),
    ];
    for (const body of bodies) {
      expect(await start(body), String(JSON.stringify(body))).toMatchObject({ status: 400, body: { error: "malformed" } });
    }
    expect(await gameCount()).toBe(0);
  });
});

describe("POST /api/games/[id]/next – with filters", () => {
  it("still sends nothing that gives the answer away", async () => {
    const gameId = await startedGame({ genre: "rock", decade: 1980 });
    const result = await sendNextRound(db, gameId, deps);
    const round = (await getGameRounds(db, gameId))![0];
    expect(Object.keys(result.body).sort()).toEqual(["options", "previewUrl", "questionType", "round", "totalRounds"]);
    const text = JSON.stringify(result.body);
    expect(text).not.toContain(round.song.artist);
    expect(text).not.toContain(String(round.song.year));
  });
});

describe("POST /api/games/[id]/replace – with filters", () => {
  it("only picks a replacement song that matches the game's filters", async () => {
    for (let i = 0; i < 5; i++) {
      const gameId = await startedGame({ genre: "rock", decade: 1980 });
      const result = await replaceRoundSong(db, gameId, JSON.stringify({ round: 2 }), Math.random, deps);
      expect(result.status).toBe(200);
      for (const song of await songsInGame(gameId)) {
        expect(song.genre).toBe("rock");
        expect(Math.floor(song.year / 10) * 10).toBe(1980);
      }
      const round = (await getGameRounds(db, gameId))![1];
      for (const option of round.options) expect(option).toMatch(/^Rock80 Song \d$/);
    }
  });

  it("keeps the question type and the filters together (artist mode)", async () => {
    const gameId = await startedGame({ mode: "artist", genre: "rock", decade: 1980 });
    await replaceRoundSong(db, gameId, JSON.stringify({ round: 4 }), Math.random, deps);
    expect((await getQuestionTypes(db, gameId))![3]).toBe("artist");
    const round = (await getGameRounds(db, gameId))![3];
    for (const option of round.options) expect(option).toMatch(/^Rock80 Artist \d$/);
  });

  it("refuses when every matching song is already in the game, even if other songs exist", async () => {
    const gameId = await startedGame({ genre: "dance", decade: 2010 });
    const before = await getGameRounds(db, gameId);
    const result = await replaceRoundSong(db, gameId, JSON.stringify({ round: 1 }), Math.random, deps);
    expect(result).toMatchObject({ status: 503, body: { error: "not-enough-songs" } });
    expect(await getGameRounds(db, gameId)).toEqual(before);
  });

  it("a game without filters can still get any song as replacement", async () => {
    const gameId = await startedGame({});
    const result = await replaceRoundSong(db, gameId, JSON.stringify({ round: 1 }), Math.random, deps);
    expect(result.status).toBe(200);
  });
});
