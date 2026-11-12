// Saving and loading rooms, their players and the players' answers. All SQL for rooms lives here.
// Tokens come in as the raw value from the request and are hashed here, so a raw token can never
// reach the database (decision 012).
import { createHash } from "node:crypto";
import type { Db, TransactionDb } from "./client";

// At most this many players per room (spec 002).
export const MAX_PLAYERS = 50;

export type RoomStatus = "lobby" | "playing" | "finished";

// What the rest of the app may know about a room. The host token hash never leaves this file.
export type Room = {
  id: string;
  code: string;
  status: RoomStatus;
  gameId: string | null; // empty until the host starts the game
  createdAt: Date; // the room expires 3 hours after this (rule in lib/game/rooms.ts)
};

export type RoomPlayer = {
  id: string;
  roomId: string;
  nickname: string;
  joinedAt: Date;
};

export type RoomAnswer = {
  roundNumber: number;
  playerId: string;
  chosenOption: number;
  points: number;
  answeredAt: Date;
};

type RoomRow = {
  id: string;
  code: string;
  status: RoomStatus;
  game_id: string | null;
  created_at: Date | string;
};

type PlayerRow = {
  id: string;
  room_id: string;
  nickname: string;
  joined_at: Date | string;
};

const ROOM_COLUMNS = "id, code, status, game_id, created_at";
const PLAYER_COLUMNS = "id, room_id, nickname, joined_at";

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  code: row.code,
  status: row.status,
  gameId: row.game_id,
  createdAt: new Date(row.created_at),
});

const toPlayer = (row: PlayerRow): RoomPlayer => ({
  id: row.id,
  roomId: row.room_id,
  nickname: row.nickname,
  joinedAt: new Date(row.joined_at),
});

// SHA-256 of a token as 64 hex characters. One-way: the token cannot be worked out from the hash.
// A plain hash without salt is enough here because tokens are long random values, not human passwords.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Creates a room in the lobby. Returns null if the code is already used (codes are never reused),
// so the caller can try again with a different code.
export async function createRoom(
  db: Db,
  room: { code: string; hostToken: string; now: Date },
): Promise<Room | null> {
  const rows = await db.query<RoomRow>(
    `INSERT INTO rooms (code, host_token_hash, created_at) VALUES ($1, $2, $3)
     ON CONFLICT (code) DO NOTHING
     RETURNING ${ROOM_COLUMNS}`,
    [room.code, hashToken(room.hostToken), room.now.toISOString()],
  );
  return rows.length === 1 ? toRoom(rows[0]) : null;
}

// The room with this code. null = there is no such room.
export async function getRoomByCode(db: Db, code: string): Promise<Room | null> {
  const rows = await db.query<RoomRow>(`SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = $1`, [code]);
  return rows.length === 1 ? toRoom(rows[0]) : null;
}

// The room with this code, but only if the token is its host token. null = unknown room or wrong token.
export async function findRoomByHostToken(db: Db, code: string, hostToken: string): Promise<Room | null> {
  const rows = await db.query<RoomRow>(
    `SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = $1 AND host_token_hash = $2`,
    [code, hashToken(hostToken)],
  );
  return rows.length === 1 ? toRoom(rows[0]) : null;
}

export type AddPlayerResult =
  | { ok: true; player: RoomPlayer }
  | { ok: false; reason: "room_not_found" | "not_in_lobby" | "room_full" | "nickname_taken" };

// Adds a player to a room that is still in the lobby, has a free seat and does not have this nickname yet
// (ignoring upper/lower case).
//
// Three queries in one transaction (decision 012):
//   1. Lock the room's row. A second join for the same room waits here until this one is finished,
//      and so does the host's Start. Without the lock, several people joining at the same moment
//      would all count "49 players" and all get in.
//   2. Insert the player – only if the room is in the lobby and has fewer than 50 players.
//      A taken nickname inserts nothing instead of raising an error (ON CONFLICT DO NOTHING).
//   3. Read the room again, to say why nothing was inserted.
// The lock has to be its own query: one query only sees the data as it was when it began.
export async function addPlayer(
  db: TransactionDb,
  join: { roomId: string; nickname: string; token: string; now: Date },
): Promise<AddPlayerResult> {
  const [, inserted, check] = await db.transaction([
    { text: "SELECT id FROM rooms WHERE id = $1 FOR UPDATE", params: [join.roomId] },
    {
      text: `INSERT INTO room_players (room_id, nickname, token_hash, joined_at)
             SELECT r.id, $2::text, $3::text, $4::timestamptz
             FROM rooms r
             WHERE r.id = $1 AND r.status = 'lobby'
               AND (SELECT count(*) FROM room_players p WHERE p.room_id = r.id) < $5::int
             ON CONFLICT (room_id, lower(nickname)) DO NOTHING
             RETURNING ${PLAYER_COLUMNS}`,
      params: [join.roomId, join.nickname, hashToken(join.token), join.now.toISOString(), MAX_PLAYERS],
    },
    {
      text: `SELECT r.status,
                    EXISTS (SELECT 1 FROM room_players p
                            WHERE p.room_id = r.id AND lower(p.nickname) = lower($2::text)) AS nickname_taken
             FROM rooms r WHERE r.id = $1`,
      params: [join.roomId, join.nickname],
    },
  ]);

  if (inserted.length === 1) return { ok: true, player: toPlayer(inserted[0] as PlayerRow) };

  const room = check[0] as { status: RoomStatus; nickname_taken: boolean } | undefined;
  if (!room) return { ok: false, reason: "room_not_found" };
  if (room.status !== "lobby") return { ok: false, reason: "not_in_lobby" };
  if (room.nickname_taken) return { ok: false, reason: "nickname_taken" };
  return { ok: false, reason: "room_full" };
}

// The player in this room who owns this token. null = wrong token, or a token from another room.
export async function findPlayerByToken(db: Db, roomId: string, token: string): Promise<RoomPlayer | null> {
  const rows = await db.query<PlayerRow>(
    `SELECT ${PLAYER_COLUMNS} FROM room_players WHERE room_id = $1 AND token_hash = $2`,
    [roomId, hashToken(token)],
  );
  return rows.length === 1 ? toPlayer(rows[0]) : null;
}

// All players of a room in the order they joined.
export async function listPlayers(db: Db, roomId: string): Promise<RoomPlayer[]> {
  const rows = await db.query<PlayerRow>(
    `SELECT ${PLAYER_COLUMNS} FROM room_players WHERE room_id = $1 ORDER BY joined_at, id`,
    [roomId],
  );
  return rows.map(toPlayer);
}

// Starts the room's game. Only a room in the lobby changes, so two Start taps at the same moment
// cannot both count. Returns false if nothing changed.
export async function startRoom(db: Db, roomId: string, gameId: string): Promise<boolean> {
  const rows = await db.query(
    `UPDATE rooms SET status = 'playing', game_id = $2
     WHERE id = $1 AND status = 'lobby'
     RETURNING id`,
    [roomId, gameId],
  );
  return rows.length === 1;
}

// Marks the room as finished after the last round. Only a playing room changes. Returns false if nothing changed.
export async function finishRoom(db: Db, roomId: string): Promise<boolean> {
  const rows = await db.query(
    "UPDATE rooms SET status = 'finished' WHERE id = $1 AND status = 'playing' RETURNING id",
    [roomId],
  );
  return rows.length === 1;
}

// Does this game belong to a room? The solo routes use this to refuse room games (spec 002).
export async function isRoomGame(db: Db, gameId: string): Promise<boolean> {
  const rows = await db.query("SELECT 1 FROM rooms WHERE game_id = $1 LIMIT 1", [gameId]);
  return rows.length > 0;
}

// Stores one player's answer for a round. It is only saved if the round is open and the player belongs
// to the room that plays this game. The primary key allows one answer per player per round, so two
// answers arriving at the same moment count once. Returns false if nothing was saved.
// Whether the answer came within the 15 seconds is checked by the caller (lib/api/rooms.ts).
export async function saveRoomAnswer(
  db: Db,
  answer: {
    gameId: string;
    roundNumber: number;
    playerId: string;
    chosenOption: number;
    points: number;
    answeredAt: Date;
  },
): Promise<boolean> {
  const rows = await db.query(
    `INSERT INTO room_answers (game_id, round_number, player_id, chosen_option, points, answered_at)
     SELECT rd.game_id, rd.round_number, p.id, $4::smallint, $5::int, $6::timestamptz
     FROM rounds rd
     JOIN rooms r ON r.game_id = rd.game_id
     JOIN room_players p ON p.room_id = r.id
     WHERE rd.game_id = $1 AND rd.round_number = $2 AND rd.status = 'open' AND p.id = $3
     ON CONFLICT DO NOTHING
     RETURNING player_id`,
    [
      answer.gameId,
      answer.roundNumber,
      answer.playerId,
      answer.chosenOption,
      answer.points,
      answer.answeredAt.toISOString(),
    ],
  );
  return rows.length === 1;
}

// All answers of a room game, by round and then by time.
export async function listRoomAnswers(db: Db, gameId: string): Promise<RoomAnswer[]> {
  const rows = await db.query<{
    round_number: number;
    player_id: string;
    chosen_option: number;
    points: number;
    answered_at: Date | string;
  }>(
    `SELECT round_number, player_id, chosen_option, points, answered_at
     FROM room_answers WHERE game_id = $1
     ORDER BY round_number, answered_at, player_id`,
    [gameId],
  );
  return rows.map((row) => ({
    roundNumber: row.round_number,
    playerId: row.player_id,
    chosenOption: row.chosen_option,
    points: row.points,
    answeredAt: new Date(row.answered_at),
  }));
}

// Closes an open round of a room game (everyone answered or the time is up): open -> answered.
// rounds.chosen_option and rounds.points stay empty – the players' answers are in room_answers.
// Only an open round of a room game changes, so two closes at the same moment count once and a
// solo game is never touched. Returns false if nothing changed.
export async function closeRoomRound(db: Db, gameId: string, roundNumber: number, now: Date): Promise<boolean> {
  const rows = await db.query(
    `UPDATE rounds SET status = 'answered', answered_at = $3
     WHERE game_id = $1 AND round_number = $2 AND status = 'open'
       AND EXISTS (SELECT 1 FROM rooms WHERE rooms.game_id = rounds.game_id)
     RETURNING round_number`,
    [gameId, roundNumber, now.toISOString()],
  );
  return rows.length === 1;
}
