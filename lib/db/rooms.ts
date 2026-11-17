// Saving and loading rooms, their players and the players' answers. All SQL for rooms lives here.
// Tokens come in as the raw value from the request and are hashed here, so a raw token can never
// reach the database (decision 012).
import { createHash } from "node:crypto";
import type { Decade } from "../game/filters";
import type { Genre } from "../game/genres";
import type { Mode } from "../game/modes";
import { DEFAULT_ROOM_SETTINGS, type RoomSettings, type RoomType } from "../game/room-settings";
import type { NewRound } from "../game/rounds";
import type { Db, TransactionDb } from "./client";

// At most this many players per room, the room creator included (issue #32; spec 002 had 50).
export const MAX_PLAYERS = 25;

export type RoomStatus = "lobby" | "playing" | "finished";
// Why a room closed before its time: the room creator left the lobby, or every player left (issue #40).
export type ClosedReason = "creator-left" | "everyone-left";
// Why a player is no longer in the room: they left during or after the game, or the room creator kicked them.
export type RemovedReason = "left" | "kicked";

// What the rest of the app may know about a room. The room creator's token hash never leaves this file.
export type Room = {
  id: string;
  code: string;
  status: RoomStatus;
  gameId: string | null; // empty until the room creator starts the game
  createdAt: Date; // the room expires 3 hours after this (rule in lib/game/rooms.ts)
  settings: RoomSettings; // fixed when the room is created (issue #34)
  closedReason: ClosedReason | null; // set when the room closed early (issue #40)
};

export type RoomPlayer = {
  id: string;
  roomId: string;
  nickname: string;
  joinedAt: Date;
  lastSeenAt: Date; // the last state request from their device (or the join)
  removed: RemovedReason | null; // null = still in the room
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
  room_type: RoomType;
  mode: Mode;
  genres: Genre[];
  decades: Decade[];
  songs_per_set: number;
  sets: number;
  closed_reason: ClosedReason | null;
};

type PlayerRow = {
  id: string;
  room_id: string;
  nickname: string;
  joined_at: Date | string;
  last_seen_at: Date | string;
  removed: RemovedReason | null;
};

const ROOM_COLUMNS =
  "id, code, status, game_id, created_at, room_type, mode, genres, decades, songs_per_set, sets, closed_reason";
const PLAYER_COLUMNS = "id, room_id, nickname, joined_at, last_seen_at, removed";

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  code: row.code,
  status: row.status,
  gameId: row.game_id,
  createdAt: new Date(row.created_at),
  // An empty list in the database means Any.
  settings: {
    type: row.room_type,
    mode: row.mode,
    genres: row.genres.length === 0 ? "any" : row.genres,
    decades: row.decades.length === 0 ? "any" : row.decades.map(Number) as Decade[],
    songsPerSet: row.songs_per_set as RoomSettings["songsPerSet"],
    sets: row.sets as RoomSettings["sets"],
  },
  closedReason: row.closed_reason,
});

const toPlayer = (row: PlayerRow): RoomPlayer => ({
  id: row.id,
  roomId: row.room_id,
  nickname: row.nickname,
  joinedAt: new Date(row.joined_at),
  lastSeenAt: new Date(row.last_seen_at),
  removed: row.removed,
});

// SHA-256 of a token as 64 hex characters. One-way: the token cannot be worked out from the hash.
// A plain hash without salt is enough here because tokens are long random values, not human passwords.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Creates a room in the lobby with the room creator as its first player (issue #32: the creator plays).
// The creator has one token: it is their player token, and its hash is also kept in rooms.host_token_hash as the
// room's creator key (the column keeps its old name). Room and player are inserted by one statement, so a room
// never exists without its creator. Returns null if the code is already used (codes are never reused), so the
// caller can try again with a different code. Without settings the room gets the default ones.
export async function createRoom(
  db: Db,
  room: { code: string; creatorToken: string; nickname: string; now: Date; settings?: RoomSettings; isPrivate?: boolean },
): Promise<{ room: Room; creator: RoomPlayer } | null> {
  const settings = room.settings ?? DEFAULT_ROOM_SETTINGS;
  const rows = await db.query<RoomRow & { player_id: string; nickname: string; joined_at: Date | string }>(
    `WITH new_room AS (
       INSERT INTO rooms (code, host_token_hash, created_at, room_type, mode, genres, decades, songs_per_set, sets, is_private)
       VALUES ($1, $2, $3, $5, $6, $7::text[], $8::int[], $9, $10, $11)
       ON CONFLICT (code) DO NOTHING
       RETURNING ${ROOM_COLUMNS}
     ), creator AS (
       INSERT INTO room_players (room_id, nickname, token_hash, joined_at, last_seen_at)
       SELECT id, $4, $2, $3, $3 FROM new_room
       RETURNING id, nickname, joined_at
     )
     SELECT new_room.*, creator.id AS player_id, creator.nickname, creator.joined_at
     FROM new_room, creator`,
    [
      room.code,
      hashToken(room.creatorToken),
      room.now.toISOString(),
      room.nickname,
      settings.type,
      settings.mode,
      settings.genres === "any" ? [] : settings.genres,
      settings.decades === "any" ? [] : settings.decades,
      settings.songsPerSet,
      settings.sets,
      room.isPrivate ?? false,
    ],
  );
  if (rows.length !== 1) return null;
  const [row] = rows;
  const created = toRoom(row);
  return {
    room: created,
    creator: toPlayer({
      id: row.player_id,
      room_id: created.id,
      nickname: row.nickname,
      joined_at: row.joined_at,
      last_seen_at: row.joined_at,
      removed: null,
    }),
  };
}

// A public room in the lobby for the "Join a room" list (issue #36): the room, its creator's nickname and how many
// players are in it now.
export type ListedRoom = { room: Room; creator: string; players: number };

// The public rooms that are still in the lobby, were created after `createdAfter` (older lobbies have closed) and
// have not closed early. Oldest first. Full rooms are included: the caller knows each room type's limit.
export async function listPublicLobbies(db: Db, createdAfter: Date): Promise<ListedRoom[]> {
  const rows = await db.query<RoomRow & { creator: string; players: number | string }>(
    `SELECT ${ROOM_COLUMNS.split(", ").map((column) => `r.${column}`).join(", ")},
            (SELECT p.nickname FROM room_players p
              WHERE p.room_id = r.id AND p.token_hash = r.host_token_hash AND p.removed IS NULL) AS creator,
            (SELECT count(*) FROM room_players p WHERE p.room_id = r.id AND p.removed IS NULL) AS players
     FROM rooms r
     WHERE r.status = 'lobby' AND NOT r.is_private AND r.closed_reason IS NULL AND r.created_at > $1::timestamptz
     ORDER BY r.created_at, r.id`,
    [createdAfter.toISOString()],
  );
  return rows
    .filter((row) => row.creator !== null)
    .map((row) => ({ room: toRoom(row), creator: row.creator, players: Number(row.players) }));
}

// The room with this code. null = there is no such room.
export async function getRoomByCode(db: Db, code: string): Promise<Room | null> {
  const rows = await db.query<RoomRow>(`SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = $1`, [code]);
  return rows.length === 1 ? toRoom(rows[0]) : null;
}

// The room with this code, but only if the token is its room creator's token. null = unknown room or wrong token.
export async function findRoomByCreatorToken(db: Db, code: string, creatorToken: string): Promise<Room | null> {
  const rows = await db.query<RoomRow>(
    `SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = $1 AND host_token_hash = $2`,
    [code, hashToken(creatorToken)],
  );
  return rows.length === 1 ? toRoom(rows[0]) : null;
}

export type AddPlayerResult =
  | { ok: true; player: RoomPlayer }
  | { ok: false; reason: "room_not_found" | "not_in_lobby" | "room_full" | "nickname_taken" };

// Adds a player to a room that is still in the lobby, has a free seat (fewer than `maxPlayers`: 2 in a Duel room) and does not have this nickname yet
// (ignoring upper/lower case).
//
// Three queries in one transaction (decision 012):
//   1. Lock the room's row. A second join for the same room waits here until this one is finished,
//      and so does the room creator's Start. Without the lock, several people joining at the same moment
//      would all count "24 players" and all get in.
//   2. Insert the player – only if the room is in the lobby and has fewer than 25 players.
//      A taken nickname inserts nothing instead of raising an error (ON CONFLICT DO NOTHING).
//   3. Read the room again, to say why nothing was inserted.
// The lock has to be its own query: one query only sees the data as it was when it began.
export async function addPlayer(
  db: TransactionDb,
  join: { roomId: string; nickname: string; token: string; now: Date; maxPlayers?: number },
): Promise<AddPlayerResult> {
  const [, inserted, check] = await db.transaction([
    { text: "SELECT id FROM rooms WHERE id = $1 FOR UPDATE", params: [join.roomId] },
    {
      text: `INSERT INTO room_players (room_id, nickname, token_hash, joined_at, last_seen_at)
             SELECT r.id, $2::text, $3::text, $4::timestamptz, $4::timestamptz
             FROM rooms r
             WHERE r.id = $1 AND r.status = 'lobby'
               AND (SELECT count(*) FROM room_players p WHERE p.room_id = r.id AND p.removed IS NULL) < $5::int
             ON CONFLICT (room_id, lower(nickname)) DO NOTHING
             RETURNING ${PLAYER_COLUMNS}`,
      params: [join.roomId, join.nickname, hashToken(join.token), join.now.toISOString(), join.maxPlayers ?? MAX_PLAYERS],
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

// The player in this room who owns this token – also one who has left or was kicked (see `removed`), so the
// caller can say why the token no longer works. null = wrong token, or a token from another room.
export async function findPlayerByToken(db: Db, roomId: string, token: string): Promise<RoomPlayer | null> {
  const rows = await db.query<PlayerRow>(
    `SELECT ${PLAYER_COLUMNS} FROM room_players WHERE room_id = $1 AND token_hash = $2`,
    [roomId, hashToken(token)],
  );
  return rows.length === 1 ? toPlayer(rows[0]) : null;
}

// All players still in a room (not left, not kicked) in the order they joined.
export async function listPlayers(db: Db, roomId: string): Promise<RoomPlayer[]> {
  const rows = await db.query<PlayerRow>(
    `SELECT ${PLAYER_COLUMNS} FROM room_players WHERE room_id = $1 AND removed IS NULL ORDER BY joined_at, id`,
    [roomId],
  );
  return rows.map(toPlayer);
}

// Notes that this player's device asked for the room state at `now` (issue #40: away after 5 s without).
// Never moves the time back, in case two requests arrive out of order.
export async function markPlayerSeen(db: Db, playerId: string, now: Date): Promise<void> {
  await db.query("UPDATE room_players SET last_seen_at = GREATEST(last_seen_at, $2::timestamptz) WHERE id = $1", [
    playerId,
    now.toISOString(),
  ]);
}

export type LeaveResult = "room-closed" | "left-lobby" | "left-game" | "not-in-room";

// A player taps Leave (issue #40). One transaction, with the room's row locked, so Start or another Leave at the
// same moment waits. Exactly one of these happens:
//   - the room creator in the lobby: the room closes for everyone ("creator-left");
//   - another player in the lobby: their row is deleted, so the seat and the nickname are free again;
//   - anyone once the game has started: they are marked "left" – gone for good, not in the standings.
//     If nobody is left after that, the room closes ("everyone-left").
export async function leaveRoom(
  db: TransactionDb,
  leave: { roomId: string; playerId: string; isCreator: boolean },
): Promise<LeaveResult> {
  const params = [leave.roomId, leave.playerId, leave.isCreator];
  const [, closed, deleted, left] = await db.transaction([
    { text: "SELECT id FROM rooms WHERE id = $1 FOR UPDATE", params: [leave.roomId] },
    {
      text: `UPDATE rooms SET closed_reason = 'creator-left'
             WHERE id = $1 AND $3::boolean AND status = 'lobby' AND closed_reason IS NULL AND $2::uuid IS NOT NULL
             RETURNING id`,
      params,
    },
    {
      text: `DELETE FROM room_players p USING rooms r
             WHERE p.id = $2 AND r.id = $1 AND p.room_id = r.id AND r.status = 'lobby' AND NOT $3::boolean
             RETURNING p.id`,
      params,
    },
    {
      text: `UPDATE room_players p SET removed = 'left' FROM rooms r
             WHERE p.id = $2 AND r.id = $1 AND p.room_id = r.id AND r.status <> 'lobby' AND p.removed IS NULL
               AND $3::boolean IS NOT NULL
             RETURNING p.id`,
      params,
    },
    {
      text: `UPDATE rooms SET closed_reason = 'everyone-left'
             WHERE id = $1 AND status <> 'lobby' AND closed_reason IS NULL
               AND NOT EXISTS (SELECT 1 FROM room_players WHERE room_id = $1 AND removed IS NULL)
             RETURNING id`,
      params: [leave.roomId],
    },
  ]);
  if (closed.length === 1) return "room-closed";
  if (deleted.length === 1) return "left-lobby";
  if (left.length === 1) return "left-game";
  return "not-in-room";
}

// The room creator kicks a player (issue #40): only a player still in the room whose device has not asked for the
// room state since before `seenBefore`. The row stays, marked "kicked", so the nickname cannot join again and the
// token gets "You were removed from this room". Returns false if nothing changed.
export async function kickPlayer(
  db: Db,
  kick: { roomId: string; playerId: string; seenBefore: Date },
): Promise<boolean> {
  const rows = await db.query(
    `UPDATE room_players SET removed = 'kicked'
     WHERE id = $2 AND room_id = $1 AND removed IS NULL AND last_seen_at < $3::timestamptz
     RETURNING id`,
    [kick.roomId, kick.playerId, kick.seenBefore.toISOString()],
  );
  return rows.length === 1;
}

// Starts the room's game. Only a room in the lobby changes, so two Start taps at the same moment
// cannot both count. Returns false if nothing changed.
export async function startRoom(db: Db, roomId: string, gameId: string): Promise<boolean> {
  const rows = await db.query(
    `UPDATE rooms SET status = 'playing', game_id = $2
     WHERE id = $1 AND status = 'lobby' AND closed_reason IS NULL
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

// Gives a round of a room game another song and options, because a device could not load its clip (issue #41).
// Only changes a round that has not started at `now` (waiting, or scheduled with a start time still to come) and
// has not been swapped before: one swap per round, safe against two reports at the same moment. A scheduled round
// starts no earlier than `earliestStart`, so every device has time to load the new clip. The database refuses a
// song that is already in the game (UNIQUE game_id + song_id). Returns false if nothing changed.
export async function swapRoomRound(
  db: Db,
  gameId: string,
  round: NewRound,
  now: Date,
  earliestStart: Date,
): Promise<boolean> {
  const rows = await db.query(
    `UPDATE rounds SET song_id = $3, options = $4, correct_option = $5, swapped = true,
       started_at = CASE WHEN status = 'open' THEN GREATEST(started_at, $7::timestamptz) ELSE started_at END
     WHERE game_id = $1 AND round_number = $2 AND NOT swapped
       AND (status = 'waiting' OR (status = 'open' AND started_at > $6::timestamptz))
       AND EXISTS (SELECT 1 FROM rooms WHERE rooms.game_id = rounds.game_id)
     RETURNING round_number`,
    [gameId, round.roundNumber, round.songId, round.options, round.correctOption, now.toISOString(), earliestStart.toISOString()],
  );
  return rows.length === 1;
}

// Has this round of a game already had its one swap?
export async function wasRoundSwapped(db: Db, gameId: string, roundNumber: number): Promise<boolean> {
  const rows = await db.query<{ swapped: boolean }>(
    "SELECT swapped FROM rounds WHERE game_id = $1 AND round_number = $2",
    [gameId, roundNumber],
  );
  return rows[0]?.swapped === true;
}
