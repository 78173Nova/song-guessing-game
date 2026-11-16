// Saving and loading games and their rounds. All SQL for games lives here.
import type { RoundStatus } from "../game/answers";
import type { Decade, Filters } from "../game/filters";
import type { Genre } from "../game/genres";
import type { Mode, QuestionType } from "../game/modes";
import type { NewRound } from "../game/rounds";
import type { Db } from "./client";

export type StoredRound = {
  roundNumber: number;
  songId: number;
  options: string[];
  correctOption: number;
  status: RoundStatus;
  startedAt: Date | null;
  answeredAt: Date | null;
  chosenOption: number | null;
  points: number | null;
  song: {
    title: string;
    artist: string;
    year: number;
    previewUrl: string | null;
    artworkUrl: string | null;
    storeUrl: string | null;
  };
};

type RoundRow = {
  round_number: number;
  song_id: number;
  options: string[];
  correct_option: number;
  status: RoundStatus;
  started_at: Date | string | null;
  answered_at: Date | string | null;
  chosen_option: number | null;
  points: number | null;
  title: string;
  artist: string;
  year: number;
  preview_url: string | null;
  artwork_url: string | null;
  store_url: string | null;
};

const toDate = (value: Date | string | null) => (value === null ? null : new Date(value));

// Creates a game in `mode` with its filters and all its rounds (status "waiting") and returns the new game's
// random UUID. A missing filter is stored as empty (Any).
// Two queries: if the second one fails, an empty game is left behind, but the browser never gets its ID.
export async function createGame(
  db: Db,
  rounds: NewRound[],
  mode: Mode = "title",
  filters: Filters = {},
): Promise<string> {
  const [game] = await db.query<{ id: string }>(
    "INSERT INTO games (mode, genre, decade) VALUES ($1, $2, $3) RETURNING id",
    [mode, filters.genre ?? null, filters.decade ?? null],
  );

  // One INSERT with a row of placeholders per round: ($1, $2, ... $6), ($1, $7, ... $11), ...
  const params: unknown[] = [game.id];
  const rows = rounds.map((round) => {
    params.push(round.roundNumber, round.songId, round.options, round.correctOption, round.questionType ?? "title");
    const n = params.length;
    return `($1, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
  });
  await db.query(
    `INSERT INTO rounds (game_id, round_number, song_id, options, correct_option, question_type)
     VALUES ${rows.join(", ")}`,
    params,
  );
  return game.id;
}

// The question type of each round of a game, in round order. null = there is no game with this ID.
export async function getQuestionTypes(db: Db, gameId: string): Promise<QuestionType[] | null> {
  const games = await db.query("SELECT id FROM games WHERE id = $1", [gameId]);
  if (games.length === 0) return null;
  const rows = await db.query<{ question_type: QuestionType }>(
    "SELECT question_type FROM rounds WHERE game_id = $1 ORDER BY round_number",
    [gameId],
  );
  return rows.map((row) => row.question_type);
}

// The genre and decade a game was started with. Only the chosen ones are in the result (missing = Any).
// null = there is no game with this ID.
export async function getGameFilters(db: Db, gameId: string): Promise<Filters | null> {
  const rows = await db.query<{ genre: Genre | null; decade: Decade | null }>(
    "SELECT genre, decade FROM games WHERE id = $1",
    [gameId],
  );
  if (rows.length === 0) return null;
  const { genre, decade } = rows[0];
  return { ...(genre === null ? {} : { genre }), ...(decade === null ? {} : { decade }) };
}

// The song IDs of each of these games, in the order the IDs were given (an empty list for an unknown game).
// Used to avoid the songs of a player's last games (decision 013). Nothing of this is sent to the browser.
export async function getSongIdsOfGames(db: Db, gameIds: string[]): Promise<number[][]> {
  if (gameIds.length === 0) return [];
  const rows = await db.query<{ game_id: string; song_id: number }>(
    "SELECT game_id, song_id FROM rounds WHERE game_id = ANY($1::uuid[])",
    [gameIds],
  );
  // Postgres returns UUIDs in lower case, the browser may have sent upper case.
  return gameIds.map((id) => rows.filter((row) => row.game_id === id.toLowerCase()).map((row) => row.song_id));
}

// All rounds of a game with their song, in order. null = there is no game with this ID.
export async function getGameRounds(db: Db, gameId: string): Promise<StoredRound[] | null> {
  const games = await db.query("SELECT id FROM games WHERE id = $1", [gameId]);
  if (games.length === 0) return null;

  const rows = await db.query<RoundRow>(
    `SELECT r.round_number, r.song_id, r.options, r.correct_option, r.status, r.started_at,
            r.answered_at, r.chosen_option, r.points,
            s.title, s.artist, s.year, s.preview_url, s.artwork_url, s.store_url
     FROM rounds r JOIN songs s ON s.id = r.song_id
     WHERE r.game_id = $1
     ORDER BY r.round_number`,
    [gameId],
  );
  return rows.map((row) => ({
    roundNumber: row.round_number,
    songId: row.song_id,
    options: row.options,
    correctOption: row.correct_option,
    status: row.status,
    startedAt: toDate(row.started_at),
    answeredAt: toDate(row.answered_at),
    chosenOption: row.chosen_option,
    points: row.points,
    song: {
      title: row.title,
      artist: row.artist,
      year: row.year,
      previewUrl: row.preview_url,
      artworkUrl: row.artwork_url,
      storeUrl: row.store_url,
    },
  }));
}

// Marks a round as sent. Only a "waiting" round changes, so a round can never be sent twice.
// Returns false if nothing changed.
export async function markRoundSent(db: Db, gameId: string, roundNumber: number, now: Date): Promise<boolean> {
  const rows = await db.query(
    `UPDATE rounds SET status = 'open', started_at = $3
     WHERE game_id = $1 AND round_number = $2 AND status = 'waiting'
     RETURNING round_number`,
    [gameId, roundNumber, now.toISOString()],
  );
  return rows.length === 1;
}

// Gives a round a different song and options (its clip would not load). The question type stays: the new
// options are of the same type (buildReplacementRound). Only a "waiting" round changes,
// so a round that has started is never swapped. Returns false if nothing changed. The database refuses
// a song that is already in the game (UNIQUE game_id + song_id).
export async function replaceRound(db: Db, gameId: string, round: NewRound): Promise<boolean> {
  const rows = await db.query(
    `UPDATE rounds SET song_id = $3, options = $4, correct_option = $5
     WHERE game_id = $1 AND round_number = $2 AND status = 'waiting'
     RETURNING round_number`,
    [gameId, round.roundNumber, round.songId, round.options, round.correctOption],
  );
  return rows.length === 1;
}

export type SavedAnswer = {
  status: "answered" | "skipped";
  chosenOption: number | null;
  points: number;
  answeredAt: Date;
};

// Stores the answer. Only an "open" round changes, so even two answers arriving at the same moment
// cannot both count. Returns false if nothing changed.
export async function saveAnswer(
  db: Db,
  gameId: string,
  roundNumber: number,
  answer: SavedAnswer,
): Promise<boolean> {
  const rows = await db.query(
    `UPDATE rounds SET status = $3, chosen_option = $4, points = $5, answered_at = $6
     WHERE game_id = $1 AND round_number = $2 AND status = 'open'
     RETURNING round_number`,
    [gameId, roundNumber, answer.status, answer.chosenOption, answer.points, answer.answeredAt.toISOString()],
  );
  return rows.length === 1;
}
