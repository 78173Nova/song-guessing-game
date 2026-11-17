import { describe, expect, it } from "vitest";
import { songPools } from "@/lib/game/recent-songs";
import { parseStartInput } from "@/lib/game/modes";

// Avoiding the songs of the player's last games (spec 003). Plain functions: no database, no network.

const A = "3f2b8c1e-9a4d-4e7b-b1c2-8d5e6f7a9b0c";
const B = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const C = "ffffffff-ffff-4fff-bfff-ffffffffffff";

describe("parseStartInput – recentGames", () => {
  it("accepts up to 3 game IDs, newest first, and passes them on in that order", () => {
    expect(parseStartInput({ recentGames: [A] })).toEqual({ ok: true, mode: "title", recentGames: [A] });
    expect(parseStartInput({ mode: "year", genre: "rock", recentGames: [C, B, A] })).toEqual({
      ok: true,
      mode: "year",
      genre: "rock",
      recentGames: [C, B, A],
    });
  });

  it("accepts upper-case UUIDs (they are the same IDs)", () => {
    expect(parseStartInput({ recentGames: [A.toUpperCase()] })).toMatchObject({ ok: true });
  });

  it("an empty list or no list means no recent games: nothing in the result", () => {
    expect(parseStartInput({ recentGames: [] })).toEqual({ ok: true, mode: "title" });
    expect(parseStartInput({ mode: "artist" })).toEqual({ ok: true, mode: "artist" });
  });

  it("rejects more than 3 IDs", () => {
    expect(parseStartInput({ recentGames: [A, B, C, A] })).toEqual({ ok: false, error: "malformed" });
  });

  it("rejects anything that is not a list of UUIDs", () => {
    const values = [
      A, // a single ID, not a list
      null,
      1,
      { 0: A },
      [1],
      [null],
      [[A]],
      ["abc"],
      [""],
      [A.replaceAll("-", "")],
      [A + "0"],
      [` ${A}`],
      ["x".repeat(36)],
    ];
    for (const recentGames of values) {
      expect(parseStartInput({ recentGames }), JSON.stringify(recentGames)).toEqual({ ok: false, error: "malformed" });
    }
  });
});

describe("songPools – which songs to try, avoiding recent ones step by step", () => {
  const songs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));
  const ids = (pools: { id: number }[][]) => pools.map((pool) => pool.map((s) => s.id));

  it("without recent games: only the full list", () => {
    expect(ids(songPools(songs, []))).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]);
  });

  it("first without the songs of all recent games, then fewer games, the full list last", () => {
    // newest game first: [1,2], then [3,4], then [5,6]
    expect(ids(songPools(songs, [[1, 2], [3, 4], [5, 6]]))).toEqual([
      [7, 8, 9, 10, 11, 12],
      [5, 6, 7, 8, 9, 10, 11, 12],
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ]);
  });

  it("leaves out a step that would keep fewer than 5 songs", () => {
    // without all 3 games: 2 songs left (too few); without the newest 2: 7 left; without the newest: 9 left
    const recent = [[1, 2, 3], [4, 5], [6, 7, 8, 9, 10]];
    expect(ids(songPools(songs, recent))).toEqual([
      [6, 7, 8, 9, 10, 11, 12],
      [4, 5, 6, 7, 8, 9, 10, 11, 12],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ]);
  });

  it("exactly 5 songs left is enough", () => {
    expect(ids(songPools(songs, [[1, 2, 3, 4, 5, 6, 7]]))[0]).toEqual([8, 9, 10, 11, 12]);
  });

  it("ignores song IDs that are not in the list (e.g. a song outside the filters) and empty games", () => {
    expect(ids(songPools(songs, [[], [99, 100]]))).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]);
  });

  it("keeps the songs' order and the song objects themselves", () => {
    const pools = songPools(songs, [[2]]);
    expect(pools[0][0]).toBe(songs[0]);
    expect(pools[0][1]).toBe(songs[2]);
  });
});
