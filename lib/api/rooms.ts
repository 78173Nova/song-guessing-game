// What each room route does, step by step: find the room, check the token, validate the input, apply the
// rules from lib/game, save, and build the reply. The route files in app/api/rooms/ only call these functions.
// The database is passed in, so the tests can use PGlite instead of Neon.
//
// Every function checks in the same order: does the room exist (404), has it closed (409),
// is the token right (403), is the input valid (400), is this the right moment (409).
import { randomBytes, randomInt } from "node:crypto";
import type { Db, TransactionDb } from "../db/client";
import { createGame, getGameRounds, markRoundSent, replaceRound, type StoredRound } from "../db/games";
import {
  addPlayer,
  closeRoomRound,
  createRoom,
  findPlayerByToken,
  findRoomByCreatorToken,
  finishRoom,
  getRoomByCode,
  listPlayers,
  listRoomAnswers,
  saveRoomAnswer,
  startRoom,
  type Room,
  type RoomAnswer,
  type RoomPlayer,
  type RoomStatus,
} from "../db/rooms";
import { listSongsWithPreview } from "../db/songs";
import { parseRoundInput } from "../game/answers";
import {
  FIRST_ROUND_DELAY_SECONDS,
  isRoomClosed,
  MIN_PLAYERS_TO_START,
  isRoundClosed,
  isTimeUp,
  isValidRoomCode,
  nextRoundStartsAt,
  parseNickname,
  parseRoomAnswerInput,
  rankByScore,
  readBearerToken,
  roundClosedAt,
  secondsLeft,
} from "../game/rooms";
import { buildReplacementRound, buildRounds, ROUNDS_PER_GAME } from "../game/rounds";
import { ANSWER_TIME_SECONDS, scoreAnswer } from "../game/scoring";
import { MUSIC_UNAVAILABLE_MESSAGE } from "../music/itunes";
import { looksLikeToken } from "../accounts/rules";
import { findSessionUsername } from "../db/accounts";
import { readJson, type ApiResult } from "./games";

// The tests pass their own clock, song shuffle and room codes. The app uses the real ones.
type Deps = { now?: () => Date; random?: () => number; newCode?: () => string };

// How often "create room" draws a new code when the one it drew is already taken.
const MAX_CODE_DRAWS = 10;

const ERRORS = {
  malformed: { status: 400, message: "The request is not valid." },
  "invalid-nickname": { status: 400, message: "Please choose a nickname with 1 to 20 characters." },
  "invalid-option": { status: 400, message: "Please choose one of the four answers." },
  "round-out-of-range": { status: 400, message: "This round does not exist in this game." },
  "wrong-token": { status: 403, message: "This device is not part of this room. Please join again." },
  "room-not-found": { status: 404, message: "There is no room with this code." },
  "room-closed": { status: 409, message: "This room has closed." },
  "room-started": { status: 409, message: "This game has already started." },
  "room-full": { status: 409, message: "This room is full." },
  "nickname-taken": { status: 409, message: "This nickname is already taken in this room." },
  "log-in-needed": { status: 401, message: "Please log in to create a room." },
  "not-enough-players": { status: 409, message: "At least 2 players are needed to start." },
  "not-started": { status: 409, message: "The game has not started yet." },
  "round-not-open": { status: 409, message: "This round is not open." },
  "too-late": { status: 409, message: "Too late – the time for this round is over." },
  "already-answered": { status: 409, message: "You have already answered this round." },
  "round-already-started": { status: 409, message: "This round has already started." },
  "not-enough-songs": { status: 503, message: MUSIC_UNAVAILABLE_MESSAGE },
  "server-error": { status: 500, message: "Something went wrong on the server. Please try again." },
} as const;

type ErrorCode = keyof typeof ERRORS;

function fail(error: ErrorCode): ApiResult {
  return { status: ERRORS[error].status, body: { error, message: ERRORS[error].message } };
}

// Either the thing we looked for, or the error reply to send back.
type Found<T> = ({ ok: true } & T) | { ok: false; result: ApiResult };

// A random 6-digit code that does not start with 0. randomInt is Node's secure random generator.
function randomRoomCode(): string {
  return String(randomInt(100000, 1000000));
}

// A token is 32 random bytes written as 64 hex characters – far too many possibilities to guess.
function randomToken(): string {
  return randomBytes(32).toString("hex");
}

// The room with this code, if it exists and has not closed (30 minutes in the lobby, 3 hours in any case).
async function findOpenRoom(db: Db, code: string, now: Date): Promise<Found<{ room: Room }>> {
  if (!isValidRoomCode(code)) return { ok: false, result: fail("room-not-found") };
  const room = await getRoomByCode(db, code);
  if (room === null) return { ok: false, result: fail("room-not-found") };
  if (isRoomClosed(room, now)) return { ok: false, result: fail("room-closed") };
  return { ok: true, room };
}

// The room, but only for a request that carries the room creator's token.
async function findRoomAsCreator(
  db: Db,
  code: string,
  authorization: string | null,
  now: Date,
): Promise<Found<{ room: Room }>> {
  const found = await findOpenRoom(db, code, now);
  if (!found.ok) return found;
  const token = readBearerToken(authorization);
  if (token === null || (await findRoomByCreatorToken(db, code, token)) === null) {
    return { ok: false, result: fail("wrong-token") };
  }
  return found;
}

// The room and the player, but only for a request that carries the token of a player in this room.
async function findRoomAsPlayer(
  db: Db,
  code: string,
  authorization: string | null,
  now: Date,
): Promise<Found<{ room: Room; player: RoomPlayer }>> {
  const found = await findOpenRoom(db, code, now);
  if (!found.ok) return found;
  const token = readBearerToken(authorization);
  const player = token === null ? null : await findPlayerByToken(db, found.room.id, token);
  if (player === null) return { ok: false, result: fail("wrong-token") };
  return { ok: true, room: found.room, player };
}

// Reads { nickname } from a request body: the nickname without the spaces around it, or the error to send.
function readNickname(rawBody: string): Found<{ nickname: string }> {
  const json = readJson(rawBody);
  if (!json.ok || typeof json.body !== "object" || json.body === null || Array.isArray(json.body)) {
    return { ok: false, result: fail("malformed") };
  }
  const nickname = parseNickname((json.body as Record<string, unknown>).nickname);
  if (nickname === null) return { ok: false, result: fail("invalid-nickname") };
  return { ok: true, nickname };
}

// POST /api/rooms – an account holder creates a room with { nickname } and becomes its room creator: the first
// player in its lobby (issue #32). Needs the session cookie of a logged-in account. Returns the code, the
// creator's player token and the nickname as it was stored. The token is returned only this once: the database
// keeps just its hash (decision 012). It is also the room's creator key for Start, Next and Replace.
// For now every room has the same settings: Multiplayer, title mode, any genre and decade, one set of 5 rounds.
export async function createNewRoom(
  db: TransactionDb,
  sessionToken: string | undefined,
  rawBody: string,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const newCode = deps.newCode ?? randomRoomCode;

  if (!looksLikeToken(sessionToken) || (await findSessionUsername(db, sessionToken, now())) === null) {
    return fail("log-in-needed");
  }
  const input = readNickname(rawBody);
  if (!input.ok) return input.result;

  const playerToken = randomToken();
  // Codes are never reused, so a drawn code can be taken. Then we draw again.
  for (let draw = 1; draw <= MAX_CODE_DRAWS; draw++) {
    const created = await createRoom(db, { code: newCode(), creatorToken: playerToken, nickname: input.nickname, now: now() });
    if (created !== null) {
      return { status: 201, body: { code: created.room.code, playerToken, nickname: created.creator.nickname } };
    }
  }
  console.error(`Room API error: no free room code after ${MAX_CODE_DRAWS} draws`);
  return fail("server-error");
}

// POST /api/rooms/[code]/join – adds a player to a room that is still in the lobby. Returns the player
// token (only this once) and the nickname as it was stored.
export async function joinRoom(db: TransactionDb, code: string, rawBody: string, deps: Deps = {}): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  if (!isValidRoomCode(code)) return fail("room-not-found");

  const input = readNickname(rawBody);
  if (!input.ok) return input.result;
  const { nickname } = input;

  const found = await findOpenRoom(db, code, now());
  if (!found.ok) return found.result;

  // addPlayer checks "lobby", "free seat" and "nickname free" itself, safely against joins at the same moment.
  const playerToken = randomToken();
  const added = await addPlayer(db, { roomId: found.room.id, nickname, token: playerToken, now: now() });
  if (!added.ok) {
    if (added.reason === "room_not_found") return fail("room-not-found");
    if (added.reason === "not_in_lobby") return fail("room-started");
    if (added.reason === "nickname_taken") return fail("nickname-taken");
    return fail("room-full");
  }
  return { status: 201, body: { playerToken, nickname: added.player.nickname } };
}

// POST /api/rooms/[code]/start – the room creator starts the game ("Start now", at least 2 players): picks the
// songs, builds the rounds with the same game core as the solo game and schedules round 1 to start 5 seconds
// later (issue #33). From then on the server moves the game forward by itself. Returns the 5 clip addresses in
// round order, so the creator's page can load the clips at once. No titles, no answers, and not the game ID.
export async function startRoomGame(
  db: Db,
  code: string,
  authorization: string | null,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const found = await findRoomAsCreator(db, code, authorization, now());
  if (!found.ok) return found.result;
  const { room } = found;

  if (room.status !== "lobby") return fail("room-started");
  if ((await listPlayers(db, room.id)).length < MIN_PLAYERS_TO_START) return fail("not-enough-players");

  const songs = await listSongsWithPreview(db);
  const built = buildRounds(songs, deps.random);
  if (!built.ok) return fail("not-enough-songs");

  const gameId = await createGame(db, built.rounds);
  // Round 1 is scheduled before the room counts as started, so a playing room always has a round coming.
  await markRoundSent(db, gameId, 1, new Date(now().getTime() + FIRST_ROUND_DELAY_SECONDS * 1000));
  // Only succeeds if the room is still in the lobby – protects against two Start taps at once.
  if (!(await startRoom(db, room.id, gameId))) return fail("room-started");

  const previewUrls = built.rounds.map((round) => songs.find((s) => s.id === round.songId)!.previewUrl);
  return { status: 200, body: { totalRounds: built.rounds.length, previewUrls } };
}

// Everything about a started room's game that the rules need.
type RoomGame = { status: RoomStatus; rounds: StoredRound[]; players: RoomPlayer[]; answers: RoomAnswer[] };

async function loadRoomGame(db: Db, room: Room): Promise<RoomGame> {
  const [rounds, players, answers] = await Promise.all([
    getGameRounds(db, room.gameId!),
    listPlayers(db, room.id),
    listRoomAnswers(db, room.gameId!),
  ]);
  return { status: room.status, rounds: rounds ?? [], players, answers };
}

// Has this round's start time come? A round in the database is "open" from the moment it is scheduled, but
// it only starts at its start time.
const hasStarted = (round: StoredRound, now: Date) =>
  round.status !== "waiting" && round.startedAt !== null && round.startedAt.getTime() <= now.getTime();

// There is no background timer (decision 008) and nobody taps Next (issue #33). Instead, every state request
// first brings the game up to date, worked out from the stored times:
// Looks at the first round that has not closed yet:
//   - waiting (the round before it has closed): schedule it to start 8 seconds after that close.
//   - open, started, and everyone has answered or its 15 seconds are over: close it at the moment it closed
//     (the last answer, or the end of the 15 seconds).
// Then it looks again: if nobody asked for a while, several rounds can be due at once. When every round is
// closed, the room is finished.
// Each step only changes something once in the database. If another request at the same moment already made
// the change, this one reloads the game and uses the saved times, so every device hears the same start time.
async function bringUpToDate(db: Db, room: Room, loaded: RoomGame, now: Date): Promise<RoomGame> {
  let game = loaded;
  let rounds = [...game.rounds];
  const reload = async () => {
    game = await loadRoomGame(db, room);
    rounds = [...game.rounds];
  };

  // Repeats until nothing more is due ("for (;;)" = repeat until a "break").
  for (;;) {
    const index = rounds.findIndex((round) => round.status !== "answered");
    if (index === -1) break;
    const round = rounds[index];

    if (round.status === "waiting") {
      // Round 1 is scheduled by Start, so there is always a closed round before a waiting one here.
      const previousClose = rounds[index - 1]?.answeredAt;
      if (!previousClose) break;
      const startsAt = nextRoundStartsAt(previousClose);
      if (!(await markRoundSent(db, room.gameId!, round.roundNumber, startsAt))) await reload();
      else rounds[index] = { ...round, status: "open", startedAt: startsAt };
      continue;
    }

    if (!hasStarted(round, now)) break; // scheduled, but its start time has not come yet
    const startedAt = round.startedAt!;
    const answerTimes = game.answers.filter((a) => a.roundNumber === round.roundNumber).map((a) => a.answeredAt);
    const playerCount = game.players.length;
    if (!isRoundClosed({ startedAt, answeredCount: answerTimes.length, playerCount }, now)) break;

    const closedAt = roundClosedAt(startedAt, answerTimes, playerCount);
    // false = another request closed it first, possibly having seen an answer this one had not: use its time.
    if (!(await closeRoomRound(db, room.gameId!, round.roundNumber, closedAt))) await reload();
    else rounds[index] = { ...round, status: "answered", answeredAt: closedAt };
  }

  let { status } = game;

  const allClosed = rounds.length > 0 && rounds.every((round) => round.status === "answered");
  if (status === "playing" && allClosed) {
    await finishRoom(db, room.id);
    status = "finished";
  }
  return { ...game, status, rounds };
}

// POST /api/rooms/[code]/answer – a player answers the open round. The points are worked out and stored
// now, but the reply does not say whether the answer was right: that only shows in the room state once
// the round has closed.
export async function answerRoomRound(
  db: Db,
  code: string,
  authorization: string | null,
  rawBody: string,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const found = await findRoomAsPlayer(db, code, authorization, now());
  if (!found.ok) return found.result;
  const { room, player } = found;

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const input = parseRoomAnswerInput(json.body);
  if (!input.ok) return fail(input.error);

  if (room.status === "lobby") return fail("not-started");
  const gameId = room.gameId!;
  const rounds = (await getGameRounds(db, gameId)) ?? [];
  if (input.round > rounds.length) return fail("round-out-of-range");

  const round = rounds[input.round - 1];
  const answeredAt = now();
  // A round that is only scheduled does not take answers before its start time.
  if (!hasStarted(round, answeredAt)) return fail("round-not-open");
  const startedAt = round.startedAt!;

  // Why an answer does not count: this player already has one for this round, or the round is over.
  const whyNot = async (): Promise<ApiResult> => {
    const answers = await listRoomAnswers(db, gameId);
    const hasAnswered = answers.some((a) => a.roundNumber === round.roundNumber && a.playerId === player.id);
    return fail(hasAnswered ? "already-answered" : "too-late");
  };

  if (round.status !== "open" || isTimeUp(startedAt, answeredAt)) return whyNot();

  // Only saved if the round is still open and the player has no answer for it yet – so a second answer
  // cannot count, even at the same moment.
  const saved = await saveRoomAnswer(db, {
    gameId,
    roundNumber: round.roundNumber,
    playerId: player.id,
    chosenOption: input.answer,
    points: scoreAnswer(input.answer === round.correctOption, startedAt, answeredAt),
    answeredAt,
  });
  if (!saved) return whyNot();

  return { status: 200, body: { round: round.roundNumber, answer: input.answer } };
}

// GET /api/rooms/[code] – the room as this viewer may see it. Every page asks for it every 1–2 seconds, and the
// request also moves the game forward (bringUpToDate). While a round is open or only scheduled, nobody gets the
// correct answer, the song or any points (decision 004).
//
// For the game the reply has:
//   serverNow   – the server's clock, so a device can work out how far its own clock is off
//   answered    – the nicknames of the players who have answered the round on screen (not what they chose)
//   previewUrls – the 5 clip addresses, for every player, so every device loads the clips in advance
//   round       – the latest round that has started (open or closed), with the answer only once closed
//   nextRound   – the round scheduled next: its number, start time and options; every device starts the
//                 clip at that time
//   standings   – every player's rank and score, counting closed rounds only
export async function getRoomState(
  db: Db,
  code: string,
  authorization: string | null,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const at = now(); // the moment every rule in this reply is checked against
  const found = await findOpenRoom(db, code, at);
  if (!found.ok) return found.result;
  const { room } = found;

  // The token decides who is asking: one of this room's players, and whether it is the room creator.
  const token = readBearerToken(authorization);
  const me = token === null ? null : await findPlayerByToken(db, room.id, token);
  // Someone without a seat can only join in the lobby. Once the game has started, say so, so the room page
  // does not offer a nickname form that can only be refused.
  if (token === null || me === null) return fail(room.status === "lobby" ? "wrong-token" : "room-started");
  const isCreator = (await findRoomByCreatorToken(db, code, token)) !== null;

  const game: RoomGame =
    room.status === "lobby"
      ? { status: "lobby", rounds: [], players: await listPlayers(db, room.id), answers: [] }
      : await bringUpToDate(db, room, await loadRoomGame(db, room), at);

  // The round on screen: the latest one that has started. null before round 1's start time.
  const current = game.rounds.findLast((round) => hasStarted(round, at)) ?? null;
  const isOpen = current?.status === "open";
  // A round that is scheduled but has not started yet (at most one).
  const upcoming = game.rounds.find((round) => round.status === "open" && !hasStarted(round, at)) ?? null;
  const currentAnswers = game.answers.filter((a) => a.roundNumber === current?.roundNumber);

  // Scores count closed rounds only. Otherwise a score that jumps during a round would give the answer away.
  const closedRounds = game.rounds.filter((round) => round.status === "answered").map((round) => round.roundNumber);
  const ranking = rankByScore(
    game.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      score: game.answers
        .filter((a) => a.playerId === player.id && closedRounds.includes(a.roundNumber))
        .reduce((sum, a) => sum + a.points, 0),
    })),
  );

  const body: Record<string, unknown> = {
    code: room.code,
    status: game.status,
    role: isCreator ? "creator" : "player",
    players: game.players.map((player) => player.nickname),
    // Who has answered the round on screen, for the ticks on the game board (issue #38). Never what they chose.
    answered: game.players
      .filter((player) => currentAnswers.some((a) => a.playerId === player.id))
      .map((player) => player.nickname),
    totalRounds: game.rounds.length || ROUNDS_PER_GAME,
    // Read again just before replying: the database calls above take time, and the device compares this with
    // the moment the reply arrives.
    serverNow: now().toISOString(),
    // The clip addresses contain no titles.
    previewUrls: room.status === "lobby" ? null : game.rounds.map((round) => round.song.previewUrl),
    nextRound:
      upcoming === null
        ? null
        : { number: upcoming.roundNumber, startsAt: upcoming.startedAt!.toISOString(), options: upcoming.options },
    round:
      current === null
        ? null
        : {
            number: current.roundNumber,
            status: isOpen ? "open" : "closed",
            startsAt: current.startedAt!.toISOString(),
            endsAt: new Date(current.startedAt!.getTime() + ANSWER_TIME_SECONDS * 1000).toISOString(),
            options: current.options,
            secondsLeft: isOpen ? secondsLeft(current.startedAt!, at) : 0,
            answeredCount: currentAnswers.length,
            // Only once the round has closed:
            ...(isOpen
              ? {}
              : {
                  correctOption: current.correctOption,
                  song: {
                    title: current.song.title,
                    artist: current.song.artist,
                    artworkUrl: current.song.artworkUrl,
                    storeUrl: current.song.storeUrl,
                  },
                }),
          },
  };

  // Every viewer is a player, the room creator included.
  const mine = ranking.find((player) => player.id === me.id)!;
  const myAnswer = currentAnswers.find((a) => a.playerId === me.id) ?? null;
  const revealed = current !== null && !isOpen;
  body.me = {
    nickname: me.nickname,
    score: mine.score,
    rank: mine.rank,
    answer: myAnswer?.chosenOption ?? null, // the player's own choice – they know it anyway
    correct: revealed ? myAnswer?.chosenOption === current.correctOption : null,
    points: revealed ? (myAnswer?.points ?? 0) : null,
  };
  body.standings = ranking.map(({ rank, nickname, score }) => ({ rank, nickname, score }));
  return { status: 200, body };
}

// POST /api/rooms/[code]/replace – the creator's page could not load a round's clip: give that round another
// song. The same rules as the solo route (only rounds that have not started), but only for the creator's token.
export async function replaceRoomSong(
  db: Db,
  code: string,
  authorization: string | null,
  rawBody: string,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const found = await findRoomAsCreator(db, code, authorization, now());
  if (!found.ok) return found.result;
  const { room } = found;

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const input = parseRoundInput(json.body);
  if (!input.ok) return fail(input.error);

  if (room.status === "lobby") return fail("not-started");
  const gameId = room.gameId!;
  const rounds = (await getGameRounds(db, gameId)) ?? [];
  if (input.round > rounds.length) return fail("round-out-of-range");
  if (rounds[input.round - 1].status !== "waiting") return fail("round-already-started");

  const songs = await listSongsWithPreview(db);
  const built = buildReplacementRound(songs, rounds.map((r) => r.songId), input.round, deps.random);
  if (!built.ok) return fail("not-enough-songs");

  // Only succeeds if the round is still waiting.
  if (!(await replaceRound(db, gameId, built.round))) return fail("round-already-started");

  const previewUrl = songs.find((s) => s.id === built.round.songId)!.previewUrl;
  return { status: 200, body: { round: input.round, previewUrl } };
}
