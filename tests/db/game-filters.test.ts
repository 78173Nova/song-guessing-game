import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { createGame, getGameFilters } from "@/lib/db/games";
import { applySchema } from "@/lib/db/schema";
import type { Song } from "@/lib/db/songs";
import { DECADES } from "@/lib/game/filters";
import { GENRES } from "@/lib/game/genres";
import type { NewRound } from "@/lib/game/rounds";
import { createTestDb } from "../helpers/test-db";
import { addTestSongs } from "../helpers/songs";

// Filters in the database (spec 003, step 5): games.genre and games.decade. Empty = Any.
let db: Db;
let songs: Song[];

beforeEach(async () => {
  db = await createTestDb();
  songs = await addTestSongs(db, 5);
});

function fiveRounds(): NewRound[] {
  return songs.map((s, i) => ({
    roundNumber: i + 1,
    songId: s.id,
    options: [s.title, "Wrong A", "Wrong B", "Wrong C"],
    correctOption: 0,
  }));
}

describe("db/schema.sql – genre and decade", () => {
  it("leaves genre and decade empty (Any) when a game is created without them", async () => {
    const [game] = await db.query<{ genre: unknown; decade: unknown }>(
      "INSERT INTO games DEFAULT VALUES RETURNING genre, decade",
    );
    expect(game).toEqual({ genre: null, decade: null });
  });

  it("accepts every genre from the list and rejects anything else", async () => {
    for (const genre of GENRES) {
      await expect(db.query("INSERT INTO games (genre) VALUES ($1)", [genre])).resolves.toBeDefined();
    }
    for (const genre of ["Rock", "soul", "", "any"]) {
      await expect(db.query("INSERT INTO games (genre) VALUES ($1)", [genre]), genre).rejects.toThrow();
    }
  });

  it("accepts the decades 1960 … 2020 and rejects anything else", async () => {
    for (const decade of DECADES) {
      await expect(db.query("INSERT INTO games (decade) VALUES ($1)", [decade])).resolves.toBeDefined();
    }
    for (const decade of [1950, 2030, 1985, 0]) {
      await expect(db.query("INSERT INTO games (decade) VALUES ($1)", [decade]), String(decade)).rejects.toThrow();
    }
  });

  it("can be applied again without errors (ALTER TABLE … IF NOT EXISTS)", async () => {
    await expect(applySchema(db)).resolves.not.toThrow();
  });
});

describe("createGame and getGameFilters", () => {
  it("stores the chosen genre and decade and reads them back", async () => {
    const gameId = await createGame(db, fiveRounds(), "artist", { genre: "rock", decade: 1980 });
    expect(await getGameFilters(db, gameId)).toEqual({ genre: "rock", decade: 1980 });
  });

  it("stores only one filter when only one was chosen", async () => {
    const genreOnly = await createGame(db, fiveRounds(), "title", { genre: "pop" });
    expect(await getGameFilters(db, genreOnly)).toEqual({ genre: "pop" });
  });

  it("without filters, the game has none (Any + Any), as before", async () => {
    const gameId = await createGame(db, fiveRounds());
    expect(await getGameFilters(db, gameId)).toEqual({});
    const [row] = await db.query("SELECT genre, decade FROM games WHERE id = $1", [gameId]);
    expect(row).toEqual({ genre: null, decade: null });
  });

  it("returns null for a game that does not exist", async () => {
    expect(await getGameFilters(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
