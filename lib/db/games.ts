// Saving and loading games and their rounds. All SQL for games lives here.
import type { RoundStatus } from "../game/answers";
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
  preview_url: string | null;
  artwork_url: string | null;
  store_url: string | null;
};

const toDate = (value: Date | string | null) => (value === null ? null : new Date(value));

// Creates a game with all its rounds (status "waiting") and returns the new game's random UUID.
// Two queries: if the second one fails, an empty game is left behind, but the browser never gets its ID.
export async function createGame(db: Db, rounds: NewRound[]): Promise<string> {
  const [game] = await db.query<{ id: string }>("INSERT INTO games DEFAULT VALUES RETURNING id");

  // One INSERT with a row of placeholders per round: ($1, $2, $3, $4, $5), ($1, $6, $7, $8, $9), ...
  const params: unknown[] = [game.id];
  const rows = rounds.map((round) => {
    params.push(round.roundNumber, round.songId, round.options, round.correctOption);
    const n = params.length;
    return `($1, $${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
  });
  await db.query(
    `INSERT INTO rounds (game_id, round_number, song_id, options, correct_option) VALUES ${rows.join(", ")}`,
    params,
  );
  return game.id;
}

// All rounds of a game with their song, in order. null = there is no game with this ID.
export async function getGameRounds(db: Db, gameId: string): Promise<StoredRound[] | null> {
  const games = await db.query("SELECT id FROM games WHERE id = $1", [gameId]);
  if (games.length === 0) return null;

  const rows = await db.query<RoundRow>(
    `SELECT r.round_number, r.song_id, r.options, r.correct_option, r.status, r.started_at,
            r.answered_at, r.chosen_option, r.points,
            s.title, s.artist, s.preview_url, s.artwork_url, s.store_url
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
