import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { createGame, getQuestionTypes, replaceRound } from "@/lib/db/games";
import type { Song } from "@/lib/db/songs";
import { applySchema } from "@/lib/db/schema";
import type { NewRound } from "@/lib/game/rounds";
import { createTestDb } from "../helpers/test-db";
import { addTestSongs } from "../helpers/songs";

// Game modes in the database (spec 003): games.mode and rounds.question_type.
let db: Db;
let songs: Song[];

beforeEach(async () => {
  db = await createTestDb();
  songs = await addTestSongs(db, 6);
});

function roundsWithTypes(types: (NewRound["questionType"] | undefined)[]): NewRound[] {
  return types.map((questionType, i) => ({
    roundNumber: i + 1,
    songId: songs[i].id,
    options: [songs[i].title, "Wrong A", "Wrong B", "Wrong C"],
    correctOption: 0,
    ...(questionType === undefined ? {} : { questionType }),
  }));
}

describe("db/schema.sql – mode and question type", () => {
  it("gives games a mode (default title) and rounds a question type (default title)", async () => {
    const [game] = await db.query<{ id: string; mode: string }>("INSERT INTO games DEFAULT VALUES RETURNING id, mode");
    expect(game.mode).toBe("title");
    await db.query(
      "INSERT INTO rounds (game_id, round_number, song_id, options, correct_option) VALUES ($1, 1, $2, $3, 0)",
      [game.id, songs[0].id, ["A", "B", "C", "D"]],
    );
    const [round] = await db.query<{ question_type: string }>("SELECT question_type FROM rounds");
    expect(round.question_type).toBe("title");
  });

  it("accepts every mode and rejects anything else", async () => {
    for (const mode of ["title", "artist", "year", "mixed"]) {
      await expect(db.query("INSERT INTO games (mode) VALUES ($1)", [mode])).resolves.toBeDefined();
    }
    for (const mode of ["songs", "Title", ""]) {
      await expect(db.query("INSERT INTO games (mode) VALUES ($1)", [mode])).rejects.toThrow();
    }
    await expect(db.query("INSERT INTO games (mode) VALUES (NULL)")).rejects.toThrow();
  });

  it("accepts the 3 question types and rejects anything else, including mixed", async () => {
    const [game] = await db.query<{ id: string }>("INSERT INTO games DEFAULT VALUES RETURNING id");
    const insert = (round: number, type: string | null) =>
      db.query(
        "INSERT INTO rounds (game_id, round_number, song_id, options, correct_option, question_type) VALUES ($1, $2, $3, $4, 0, $5)",
        [game.id, round, songs[round - 1].id, ["A", "B", "C", "D"], type],
      );
    await expect(insert(1, "title")).resolves.toBeDefined();
    await expect(insert(2, "artist")).resolves.toBeDefined();
    await expect(insert(3, "year")).resolves.toBeDefined();
    await expect(insert(4, "mixed")).rejects.toThrow();
    await expect(insert(4, null)).rejects.toThrow();
  });

  it("adds the new columns to a database whose tables already exist without them", async () => {
    await db.query("ALTER TABLE rounds DROP COLUMN question_type");
    await db.query("ALTER TABLE games DROP COLUMN mode");

    await applySchema(db);

    const columns = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name = 'games' AND column_name = 'mode') OR (table_name = 'rounds' AND column_name = 'question_type')`,
    );
    expect(columns).toHaveLength(2);
  });
});

describe("createGame / getQuestionTypes", () => {
  it("stores the game's mode and each round's question type", async () => {
    const gameId = await createGame(db, roundsWithTypes(["title", "artist", "year", "artist", "title"]), "mixed");

    const [game] = await db.query<{ mode: string }>("SELECT mode FROM games WHERE id = $1", [gameId]);
    expect(game.mode).toBe("mixed");
    expect(await getQuestionTypes(db, gameId)).toEqual(["title", "artist", "year", "artist", "title"]);
  });

  it("uses title for the mode and for rounds without a question type", async () => {
    const gameId = await createGame(db, roundsWithTypes([undefined, undefined, undefined, undefined, undefined]));

    const [game] = await db.query<{ mode: string }>("SELECT mode FROM games WHERE id = $1", [gameId]);
    expect(game.mode).toBe("title");
    expect(await getQuestionTypes(db, gameId)).toEqual(["title", "title", "title", "title", "title"]);
  });

  it("returns null for an unknown game", async () => {
    expect(await getQuestionTypes(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("keeps a round's question type when its song is replaced", async () => {
    const gameId = await createGame(db, roundsWithTypes(["year", "year", "year", "year", "year"]), "year");
    const replaced = await replaceRound(db, gameId, {
      roundNumber: 2,
      songId: songs[5].id,
      options: ["2000", "1994", "2003", "1991"],
      correctOption: 0,
      questionType: "year",
    });
    expect(replaced).toBe(true);
    expect(await getQuestionTypes(db, gameId)).toEqual(["year", "year", "year", "year", "year"]);
  });
});
