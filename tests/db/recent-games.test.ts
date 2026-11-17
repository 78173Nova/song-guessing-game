import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { createGame, getSongIdsOfGames } from "@/lib/db/games";
import type { Song } from "@/lib/db/songs";
import { createTestDb } from "../helpers/test-db";
import { addTestSongs } from "../helpers/songs";

// The songs of earlier games, to avoid them in the next one (spec 003).
let db: Db;
let songs: Song[];

beforeEach(async () => {
  db = await createTestDb();
  songs = await addTestSongs(db, 10);
});

function gameWith(songIds: number[]): Promise<string> {
  return createGame(
    db,
    songIds.map((songId, i) => ({ roundNumber: i + 1, songId, options: ["A", "B", "C", "D"], correctOption: 0 })),
  );
}

describe("getSongIdsOfGames", () => {
  it("returns the song IDs of each game, in the order the games were given", async () => {
    const first = await gameWith([songs[0].id, songs[1].id, songs[2].id, songs[3].id, songs[4].id]);
    const second = await gameWith([songs[5].id, songs[6].id, songs[7].id, songs[8].id, songs[9].id]);
    const result = await getSongIdsOfGames(db, [second, first]);
    expect(result.map((ids) => [...ids].sort((a, b) => a - b))).toEqual([
      songs.slice(5, 10).map((s) => s.id),
      songs.slice(0, 5).map((s) => s.id),
    ]);
  });

  it("gives an empty list for an unknown game, without an error", async () => {
    const known = await gameWith([songs[0].id, songs[1].id, songs[2].id, songs[3].id, songs[4].id]);
    const unknown = "00000000-0000-4000-8000-000000000000";
    const result = await getSongIdsOfGames(db, [unknown, known]);
    expect(result[0]).toEqual([]);
    expect(result[1]).toHaveLength(5);
  });

  it("gives an empty list for no games, without a query error", async () => {
    expect(await getSongIdsOfGames(db, [])).toEqual([]);
  });

  it("treats upper- and lower-case IDs as the same game", async () => {
    const gameId = await gameWith([songs[0].id, songs[1].id, songs[2].id, songs[3].id, songs[4].id]);
    expect((await getSongIdsOfGames(db, [gameId.toUpperCase()]))[0]).toHaveLength(5);
  });
});
