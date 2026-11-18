import { beforeEach, describe, expect, it } from "vitest";
import { getSongCounts, startGame } from "@/lib/api/games";
import type { Db } from "@/lib/db/client";
import { listSongs, savePreview, setCatalogue, upsertSongs, type SongInput } from "@/lib/db/songs";
import type { SongCount } from "@/lib/game/filters";
import { createTestDb } from "../helpers/test-db";

// GET /api/games/song-counts – how many playable songs each genre + decade has, so the start screen can grey
// out choices with too few (spec 003, "filter gaps"). Against PGlite, no network.
let db: Db;

const GROUPS: { name: string; genre: string; years: number[] }[] = [
  { name: "Rock80", genre: "rock", years: [1980, 1981, 1983, 1985, 1987, 1989] }, // 6
  { name: "Pop90", genre: "pop", years: [1990, 1992, 1994, 1996, 1998] }, // exactly 5
  { name: "HipHop20", genre: "hip-hop", years: [2020, 2021, 2022, 2023] }, // only 4
  { name: "Rock80NoClip", genre: "rock", years: [1984] }, // no clip: not playable
  { name: "Retired", genre: "rock", years: [1982] }, // has a clip, but not in the catalogue any more
];

let input: SongInput[];

beforeEach(async () => {
  db = await createTestDb();
  input = GROUPS.flatMap((g) =>
    g.years.map((year, i) => ({ title: `${g.name} Song ${i + 1}`, artist: `${g.name} Artist ${i + 1}`, year, genre: g.genre })),
  );
  await upsertSongs(db, input);
  for (const song of await listSongs(db)) {
    if (song.title.includes("NoClip")) continue;
    await savePreview(
      db,
      song.id,
      { previewUrl: `https://audio.example.com/${song.id}.m4a`, artworkUrl: "", storeUrl: "" },
      new Date("2026-11-18T10:00:00Z"),
    );
  }
  await setCatalogue(db, input.filter((s) => !s.title.startsWith("Retired")));
});

const counts = async () => {
  const result = await getSongCounts(db);
  expect(result.status).toBe(200);
  return (result.body as { counts: SongCount[] }).counts;
};

describe("GET /api/games/song-counts", () => {
  it("counts only playable songs: with a clip and still in the catalogue", async () => {
    expect(await counts()).toEqual([
      { genre: "hip-hop", decade: 2020, count: 4 },
      { genre: "pop", decade: 1990, count: 5 },
      { genre: "rock", decade: 1980, count: 6 },
    ]);
  });

  it("sends only the counts – no titles, artists, years or song IDs", async () => {
    const result = await getSongCounts(db);
    expect(Object.keys(result.body)).toEqual(["counts"]);
    const text = JSON.stringify(result.body);
    expect(text).not.toContain("Song");
    expect(text).not.toContain("Artist");
    expect(text).not.toContain("1987");
  });

  it("an empty catalogue gives an empty list, not an error", async () => {
    const empty = await createTestDb();
    const result = await getSongCounts(empty);
    expect(result).toEqual({ status: 200, body: { counts: [] } });
  });
});

describe("POST /api/games still decides – the counts only help the screen", () => {
  it("refuses a combination the counts show as too small (4 songs), and stores no game", async () => {
    const result = await startGame(db, Math.random, JSON.stringify({ genre: "hip-hop", decade: 2020 }));
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ error: "too-few-songs" });
    expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM games"))[0].n).toBe(0);
  });

  it("refuses a combination with no songs at all", async () => {
    const result = await startGame(db, Math.random, JSON.stringify({ genre: "hip-hop", decade: 1960 }));
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ error: "too-few-songs" });
  });

  it("starts a game for a combination the counts show with exactly 5 songs", async () => {
    const result = await startGame(db, Math.random, JSON.stringify({ genre: "pop", decade: 1990 }));
    expect(result.status).toBe(201);
  });
});
