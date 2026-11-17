// What each room route does, step by step: find the room, check the token, validate the input, apply the
// rules from lib/game, save, and build the reply. The route files in app/api/rooms/ only call these functions.
// The database is passed in, so the tests can use PGlite instead of Neon.
//
// Every function checks in the same order: does the room exist (404), has it closed (409),
// is the token right (403), is the input valid (400), is this the right moment (409).
import { randomBytes, randomInt } from "node:crypto";
import type { Db, TransactionDb } from "../db/client";
import { createGame, getGameRounds, getQuestionTypes, markRoundSent, type StoredRound } from "../db/games";
import {
  addPlayer,
  choosePlayAgain,
  closeRoomRound,
  createRoom,
  creatorPlayerId,
  endPlayAgainVote,
  findPlayerByToken,
  findRoomByCreatorToken,
  finishRoom,
  getRoomByCode,
  kickPlayer,
  leaveRoom,
  listPlayers,
  listRoomAnswers,
  markPlayerSeen,
  saveRoomAnswer,
  songsPlayedEarlier,
  startRoom,
  swapRoomRound,
  wasRoundSwapped,
  type Room,
  type RoomAnswer,
  type RoomPlayer,
  type RoomStatus,
} from "../db/rooms";
import type { QuestionType } from "../game/modes";
import {
  endsSet,
  MAX_PLAYERS_BY_TYPE,
  matchingSongs,
  parseRoomSettings,
  parseSongChoiceQuery,
  setOfRound,
  tooFewRoomSongsMessage,
  totalRoundsOf,
  type RoomSettings,
} from "../game/room-settings";
import { listSongsWithPreview, type Song } from "../db/songs";
import { parseRoundInput } from "../game/answers";
import {
  FIRST_ROUND_DELAY_SECONDS,
  isRoomClosed,
  MIN_PLAYERS_TO_START,
  isRoundClosed,
  isTimeUp,
  isValidRoomCode,
  isAway,
  isPlayAgainVoteOver,
  kickableIfSeenBefore,
  MAX_GAMES_PER_ROOM,
  nextRoundStartsAt,
  pickNewCreator,
  playAgainEndsAt,
  parseNickname,
  parseRoomAnswerInput,
  rankByScore,
  readBearerToken,
  roundClosedAt,
  secondsLeft,
  SWAP_LOAD_SECONDS,
} from "../game/rooms";
import { buildReplacementRound, buildRounds } from "../game/rounds";
import { ANSWER_TIME_SECONDS, scoreAnswer } from "../game/scoring";
import { MUSIC_UNAVAILABLE_MESSAGE } from "../music/itunes";
import { looksLikeToken } from "../accounts/rules";
import { findSessionUserId } from "../db/accounts";
import { readJson, type ApiResult } from "./games";

// The tests pass their own clock, song shuffle and room codes. The app uses the real ones.
type Deps = { now?: () => Date; random?: () => number; newCode?: () => string };

// How often "create room" draws a new code when the one it drew is already taken.
const MAX_CODE_DRAWS = 10;

const ERRORS = {
  malformed: { status: 400, message: "The request is not valid." },
  "invalid-nickname": { status: 400, message: "Please choose a nickname with 1 to 20 characters." },
  "invalid-settings": { status: 400, message: "Please choose valid room settings." },
  "invalid-option": { status: 400, message: "Please choose one of the four answers." },
  "round-out-of-range": { status: 400, message: "This round does not exist in this game." },
  "wrong-token": { status: 403, message: "This device is not part of this room. Please join again." },
  "room-not-found": { status: 404, message: "There is no room with this code." },
  "room-closed": { status: 409, message: "This room has closed." },
  "room-closed-by-creator": { status: 409, message: "The room creator closed the room." },
  "no-account-holder": { status: 409, message: "No account holder is left to run the room." },
  "not-finished": { status: 409, message: "The game has not finished yet." },
  "no-more-games": { status: 409, message: `A room hosts at most ${MAX_GAMES_PER_ROOM} games.` },
  "vote-over": { status: 409, message: "The time to choose is over." },
  kicked: { status: 403, message: "The room creator removed you from this room." },
  left: { status: 403, message: "You have left this room." },
  "not-creator": { status: 403, message: "Only the room creator can do this." },
  "player-not-found": { status: 404, message: "There is no player with this nickname in this room." },
  "not-away-long-enough": { status: 409, message: "A player can only be kicked after being away for more than 60 seconds." },
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
  "already-swapped": { status: 409, message: "This round's song has already been swapped once." },
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
  if (room.closedReason === "creator-left") return { ok: false, result: fail("room-closed-by-creator") };
  if (room.closedReason === "no-account-holder") return { ok: false, result: fail("no-account-holder") };
  if (room.closedReason !== null || isRoomClosed(room, now)) return { ok: false, result: fail("room-closed") };
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
  if (player.removed !== null) return { ok: false, result: fail(player.removed) };
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

// Reads { nickname, settings? } from the body of "create a room". Only these two fields are allowed. Without
// settings the room gets the default ones (DEFAULT_ROOM_SETTINGS).
function readCreateInput(rawBody: string): Found<{ nickname: string; settings?: RoomSettings }> {
  const input = readNickname(rawBody);
  if (!input.ok) return input;
  const { body } = readJson(rawBody) as { ok: true; body: Record<string, unknown> };
  if (Object.keys(body).some((field) => field !== "nickname" && field !== "settings")) {
    return { ok: false, result: fail("malformed") };
  }
  if (!("settings" in body)) return { ok: true, nickname: input.nickname };
  const settings = parseRoomSettings(body.settings);
  if (settings === null) return { ok: false, result: fail("invalid-settings") };
  return { ok: true, nickname: input.nickname, settings };
}

// 422 with the number of matching songs: the room creator can fix it by choosing other settings.
function tooFewSongs(matching: number, message = tooFewRoomSongsMessage(matching)): ApiResult {
  return { status: 422, body: { error: "too-few-songs", matching, message } };
}

// The playable songs that match the room's genres and decades.
async function songsFor(db: Db, settings: RoomSettings): Promise<Song[]> {
  return matchingSongs(await listSongsWithPreview(db), settings);
}

// Builds the rounds of a game with these settings: sets × songs per set different songs in the room's mode.
// `avoid`: songs of the room's earlier games, left out while enough others match (issue #43).
function buildRoomRounds(songs: Song[], settings: RoomSettings, now: Date, random?: () => number, avoid: number[] = []) {
  return buildRounds(songs, random, {
    mode: settings.mode,
    currentYear: now.getFullYear(),
    rounds: totalRoundsOf(settings),
    avoid,
  });
}

// POST /api/rooms – an account holder creates a room with { nickname, settings } and becomes its room creator: the first
// player in its lobby (issue #32). Needs the session cookie of a logged-in account. Returns the code, the
// creator's player token and the nickname as it was stored. The token is returned only this once: the database
// keeps just its hash (decision 012). It is also the room's creator key for Start.
// The settings (issue #34) are fixed from now on. Too few matching songs are refused with 422 and their count.
export async function createNewRoom(
  db: TransactionDb,
  sessionToken: string | undefined,
  rawBody: string,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const newCode = deps.newCode ?? randomRoomCode;

  const accountId = looksLikeToken(sessionToken) ? await findSessionUserId(db, sessionToken, now()) : null;
  if (accountId === null) return fail("log-in-needed");
  const input = readCreateInput(rawBody);
  if (!input.ok) return input.result;
  if (input.settings !== undefined) {
    const songs = await songsFor(db, input.settings);
    if (songs.length < totalRoundsOf(input.settings)) return tooFewSongs(songs.length);
    // Enough songs, but e.g. not 4 different artists for artist mode: the game could not be built.
    if (!buildRoomRounds(songs, input.settings, now()).ok) {
      return tooFewSongs(
        songs.length,
        "These songs have too few different titles or artists for this mode. Choose more genres/decades or another mode.",
      );
    }
  }

  const playerToken = randomToken();
  // Codes are never reused, so a drawn code can be taken. Then we draw again.
  for (let draw = 1; draw <= MAX_CODE_DRAWS; draw++) {
    const created = await createRoom(db, {
      code: newCode(),
      creatorToken: playerToken,
      nickname: input.nickname,
      now: now(),
      settings: input.settings,
      accountId,
    });
    if (created !== null) {
      return { status: 201, body: { code: created.room.code, playerToken, nickname: created.creator.nickname } };
    }
  }
  console.error(`Room API error: no free room code after ${MAX_CODE_DRAWS} draws`);
  return fail("server-error");
}

// GET /api/rooms/matching-songs?genres=pop,rock&decades=1980 – how many playable songs match one of the genres
// and one of the decades ("any" for every one). The create form shows it while the creator chooses.
export async function countMatchingSongs(db: Db, params: URLSearchParams): Promise<ApiResult> {
  const choice = parseSongChoiceQuery(params);
  if (choice === null) return fail("invalid-settings");
  return { status: 200, body: { count: matchingSongs(await listSongsWithPreview(db), choice).length } };
}

// POST /api/rooms/[code]/join – adds a player to a room that is still in the lobby. Returns the player
// token (only this once) and the nickname as it was stored. The player who fills the last seat (2 in a Duel room,
// 25 in a Multiplayer room) starts the game: a full room starts by itself (issue #34).
// A tab that was kicked from this room still has its old token and sends it along (issue #40): then the join is
// refused, so a kicked player cannot simply come back under another nickname from the same tab.
export async function joinRoom(
  db: TransactionDb,
  code: string,
  rawBody: string,
  deps: Deps = {},
  authorization: string | null = null,
  sessionToken?: string,
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  if (!isValidRoomCode(code)) return fail("room-not-found");

  const input = readNickname(rawBody);
  if (!input.ok) return input.result;
  const { nickname } = input;

  const found = await findOpenRoom(db, code, now());
  if (!found.ok) return found.result;

  const oldToken = readBearerToken(authorization);
  const before = oldToken === null ? null : await findPlayerByToken(db, found.room.id, oldToken);
  if (before?.removed === "kicked") return fail("kicked");

  // addPlayer checks "lobby", "free seat" and "nickname free" itself, safely against joins at the same moment.
  const playerToken = randomToken();
  const maxPlayers = MAX_PLAYERS_BY_TYPE[found.room.settings.type];
  // A logged-in player is an account holder: they can take over the room creator role after a game (issue #43).
  const accountId = looksLikeToken(sessionToken) ? await findSessionUserId(db, sessionToken, now()) : null;
  const added = await addPlayer(db, {
    roomId: found.room.id,
    nickname,
    token: playerToken,
    now: now(),
    maxPlayers,
    accountId,
  });
  if (!added.ok) {
    if (added.reason === "room_not_found") return fail("room-not-found");
    if (added.reason === "not_in_lobby") return fail("room-started");
    if (added.reason === "nickname_taken") return fail("nickname-taken");
    return fail("room-full");
  }
  if ((await listPlayers(db, found.room.id)).length >= maxPlayers) {
    const started = await startGameNow(db, found.room, now(), deps.random);
    // The join itself worked. If the game cannot start, the room creator sees why on "Start now".
    if (started.status !== 200) console.error("Room API: a full room could not start:", started.body.error);
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
  return startGameNow(db, room, now(), deps.random);
}

// Starts a room's game with its settings: "Start now", or the join that fills the room.
// A room's next game avoids the songs of its earlier games (issue #43) as long as enough songs match its settings;
// otherwise it picks from all of them.
async function startGameNow(db: Db, room: Room, now: Date, random?: () => number): Promise<ApiResult> {
  const songs = await songsFor(db, room.settings);
  const built = buildRoomRounds(songs, room.settings, now, random, await songsPlayedEarlier(db, room));
  if (!built.ok) return fail("not-enough-songs");

  const gameId = await createGame(db, built.rounds, room.settings.mode);
  // Round 1 is scheduled before the room counts as started, so a playing room always has a round coming.
  await markRoundSent(db, gameId, 1, new Date(now.getTime() + FIRST_ROUND_DELAY_SECONDS * 1000));
  // Only succeeds if the room is still in the lobby – protects against two Start taps at once.
  if (!(await startRoom(db, room.id, gameId))) return fail("room-started");

  const previewUrls = built.rounds.map((round) => songs.find((s) => s.id === round.songId)!.previewUrl);
  return { status: 200, body: { totalRounds: built.rounds.length, previewUrls } };
}

// Everything about a started room's game that the rules need. Players who have left or were kicked are not in it,
// and neither are their answers (issue #40): they are gone from the standings, and a round no longer waits for them.
type RoomGame = {
  status: RoomStatus;
  rounds: StoredRound[];
  questionTypes: QuestionType[]; // what each round asks, in round order
  players: RoomPlayer[];
  answers: RoomAnswer[];
};

async function loadRoomGame(db: Db, room: Room): Promise<RoomGame> {
  const [rounds, questionTypes, players, answers] = await Promise.all([
    getGameRounds(db, room.gameId!),
    getQuestionTypes(db, room.gameId!),
    listPlayers(db, room.id),
    listRoomAnswers(db, room.gameId!),
  ]);
  const inRoom = (answer: RoomAnswer) => players.some((player) => player.id === answer.playerId);
  return {
    status: room.status,
    rounds: rounds ?? [],
    questionTypes: questionTypes ?? [],
    players,
    answers: answers.filter(inRoom),
  };
}

// Has this round's start time come? A round in the database is "open" from the moment it is scheduled, but
// it only starts at its start time.
const hasStarted = (round: StoredRound, now: Date) =>
  round.status !== "waiting" && round.startedAt !== null && round.startedAt.getTime() <= now.getTime();

// There is no background timer (decision 008) and nobody taps Next (issue #33). Instead, every state request
// first brings the game up to date, worked out from the stored times:
// Looks at the first round that has not closed yet:
//   - waiting (the round before it has closed): schedule it to start 8 seconds after that close, or 23 seconds
//     after it when that round ended a set (set summary and standings first, issue #34).
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
      const startsAt = nextRoundStartsAt(previousClose, endsSet(index, room.settings.songsPerSet));
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
  db: TransactionDb,
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
  if (me.removed !== null) return fail(me.removed);
  const isCreator = (await findRoomByCreatorToken(db, code, token)) !== null;
  // This request shows that the player's device is here (issue #40: away after 5 s without one).
  await markPlayerSeen(db, me.id, at);

  const game: RoomGame =
    room.status === "lobby"
      ? { status: "lobby", rounds: [], questionTypes: [], players: await listPlayers(db, room.id), answers: [] }
      : await bringUpToDate(db, room, await loadRoomGame(db, room), at);

  // After the game: the vote on "Play again" (issue #43). Once it is over, the room goes back to the lobby (or
  // closes), and this request answers with the room as it is now – or with "You have left" for a non-voter.
  const vote = game.status === "finished" ? playAgainVote(room, game, at) : null;
  if (vote !== null && isPlayAgainVoteOver(vote, at)) {
    await endVote(db, room, game, at, deps.random ?? Math.random);
    return getRoomState(db, code, authorization, deps);
  }

  // The round on screen: the latest one that has started. null before round 1's start time.
  const current = game.rounds.findLast((round) => hasStarted(round, at)) ?? null;
  const questionTypeOf = (round: StoredRound) => game.questionTypes[round.roundNumber - 1] ?? "title";
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
    settings: room.settings,
    // Who has answered the round on screen, for the ticks on the game board (issue #38). Never what they chose.
    answered: game.players
      .filter((player) => currentAnswers.some((a) => a.playerId === player.id))
      .map((player) => player.nickname),
    // Players whose device has not asked for 5 s, for the loading symbol on their nickname (issue #40).
    away: game.players.filter((player) => isAway(player.lastSeenAt, at)).map((player) => player.nickname),
    // The players the room creator may kick now (away for more than 60 s). Empty for everyone else.
    kickable: isCreator
      ? game.players.filter((player) => player.lastSeenAt < kickableIfSeenBefore(at)).map((player) => player.nickname)
      : [],
    totalRounds: game.rounds.length || totalRoundsOf(room.settings),
    // Which of the room's games this is (issue #43): the one being played, or the next one in the lobby.
    gameNumber: gameNumberOf(room),
    // After a game: when the vote on "Play again" ends and who has chosen it. null during a game, in the lobby
    // and after the last game a room may host.
    playAgain:
      vote === null
        ? null
        : {
            endsAt: vote.endsAt.toISOString(),
            chosen: game.players.filter((player) => player.playAgain).map((player) => player.nickname),
          },
    // Read again just before replying: the database calls above take time, and the device compares this with
    // the moment the reply arrives.
    serverNow: now().toISOString(),
    // The clip addresses contain no titles.
    previewUrls: room.status === "lobby" ? null : game.rounds.map((round) => round.song.previewUrl),
    nextRound:
      upcoming === null
        ? null
        : {
            number: upcoming.roundNumber,
            startsAt: upcoming.startedAt!.toISOString(),
            options: upcoming.options,
            questionType: questionTypeOf(upcoming),
          },
    round:
      current === null
        ? null
        : {
            number: current.roundNumber,
            status: isOpen ? "open" : "closed",
            startsAt: current.startedAt!.toISOString(),
            endsAt: new Date(current.startedAt!.getTime() + ANSWER_TIME_SECONDS * 1000).toISOString(),
            options: current.options,
            questionType: questionTypeOf(current),
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
    // The set summary (issue #34): every closed round with this player's result. The page shows one set's part
    // after each set, and all of it at the end.
    summary: game.rounds
      .filter((round) => round.status === "answered")
      .map((round) => {
        const answer = game.answers.find((a) => a.roundNumber === round.roundNumber && a.playerId === me.id);
        return {
          round: round.roundNumber,
          set: setOfRound(round.roundNumber, room.settings.songsPerSet),
          title: round.song.title,
          artist: round.song.artist,
          storeUrl: round.song.storeUrl,
          correct: answer !== undefined && answer.chosenOption === round.correctOption,
          points: answer?.points ?? 0,
        };
      }),
  };
  body.standings = ranking.map(({ rank, nickname, score }) => ({ rank, nickname, score }));
  return { status: 200, body };
}


// POST /api/rooms/[code]/replace – a player's device could not load a round's clip (issue #41): give that round
// another song that matches the room's settings and is not in the game yet, and every device loads the new clip.
// Any player of the room may report, but only before the round starts, and only once per round – so nobody can
// skip songs by reporting failures again and again. A late report moves the round's start back so it starts
// SWAP_LOAD_SECONDS after the report (at most that much later than planned).
export async function replaceRoomSong(
  db: Db,
  code: string,
  authorization: string | null,
  rawBody: string,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const found = await findRoomAsPlayer(db, code, authorization, now());
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

  // Why a swap is refused: this round already had its swap, or it has started.
  const at = now();
  const whyNot = async (): Promise<ApiResult> =>
    fail((await wasRoundSwapped(db, gameId, input.round)) ? "already-swapped" : "round-already-started");
  if (hasStarted(rounds[input.round - 1], at)) return fail("round-already-started");

  // The new song matches the room's genres and decades and keeps the round's question type (issue #34).
  // Like Start, it avoids songs of the room's earlier games while it can (issue #43).
  const songs = await songsFor(db, room.settings);
  const questionType = ((await getQuestionTypes(db, gameId)) ?? [])[input.round - 1];
  const inGame = rounds.map((r) => r.songId);
  const options = { questionType, currentYear: at.getFullYear() };
  const played = await songsPlayedEarlier(db, room);
  const avoiding = buildReplacementRound(songs, [...inGame, ...played], input.round, deps.random, options);
  const built = avoiding.ok ? avoiding : buildReplacementRound(songs, inGame, input.round, deps.random, options);
  if (!built.ok) return fail("not-enough-songs");

  // Only succeeds if the round has not started and has not been swapped – even with two reports at once.
  const earliestStart = new Date(at.getTime() + SWAP_LOAD_SECONDS * 1000);
  if (!(await swapRoomRound(db, gameId, built.round, at, earliestStart))) return whyNot();

  const previewUrl = songs.find((s) => s.id === built.round.songId)!.previewUrl;
  return { status: 200, body: { round: input.round, previewUrl } };
}

// POST /api/rooms/[code]/kick – the room creator removes a player who has been away for more than 60 s
// (issue #40), in the lobby or during the game. Body: { nickname }. The page asks "Are you sure you want to kick
// <nickname>?" first. The kicked player loses their seat for good and disappears from the standings.
// Once the room creator has left a game, their token no longer works, so nobody can kick.
export async function kickRoomPlayer(
  db: Db,
  code: string,
  authorization: string | null,
  rawBody: string,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const at = now();
  const found = await findRoomAsPlayer(db, code, authorization, at);
  if (!found.ok) return found.result;
  const { room, player: me } = found;
  if ((await findRoomByCreatorToken(db, code, readBearerToken(authorization)!)) === null) return fail("not-creator");

  const input = readNickname(rawBody);
  if (!input.ok) return input.result;
  const target = (await listPlayers(db, room.id)).find(
    (player) => player.nickname.toLowerCase() === input.nickname.toLowerCase() && player.id !== me.id,
  );
  if (target === undefined) return fail("player-not-found");

  // Only changes the player if they are still in the room and still away long enough at this moment.
  if (!(await kickPlayer(db, { roomId: room.id, playerId: target.id, seenBefore: kickableIfSeenBefore(at) }))) {
    return fail("not-away-long-enough");
  }
  return { status: 200, body: { nickname: target.nickname } };
}

// POST /api/rooms/[code]/leave – a player taps Leave (issue #40). In the lobby the seat frees up, and the
// room creator leaving closes the room for everyone. Once the game has started, the player is gone for good
// and removed from the standings; the game goes on without them, and the room closes when nobody is left.
export async function playerLeavesRoom(
  db: TransactionDb,
  code: string,
  authorization: string | null,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const found = await findRoomAsPlayer(db, code, authorization, now());
  if (!found.ok) return found.result;
  const { room, player } = found;
  const isCreator = (await findRoomByCreatorToken(db, code, readBearerToken(authorization)!)) !== null;

  const result = await leaveRoom(db, { roomId: room.id, playerId: player.id, isCreator });
  if (result === "not-in-room") return fail("wrong-token"); // left at the same moment from another tab
  return { status: 200, body: { left: true, roomClosed: result === "room-closed" } };
}

// Play again (issue #43). A room hosts up to 5 games, one after another. Which game is this: the one being played,
// or in the lobby the one that comes next.
const gameNumberOf = (room: Room) => room.earlierGames.length + 1;

// The vote after a finished game: when it ends, how many of the players still in the room have chosen "Play again",
// and how many players there are. null after the last game a room may host: then "Play again" is not offered.
// With `now`: also null once the time is over and nobody chose "Play again" – then nothing changes, and the room
// stays finished with its final standings, as it did before rooms hosted several games.
function playAgainVote(
  room: Room,
  game: RoomGame,
  now?: Date,
): { endsAt: Date; chosen: number; players: number } | null {
  if (gameNumberOf(room) >= MAX_GAMES_PER_ROOM) return null;
  const lastClose = game.rounds.at(-1)?.answeredAt;
  if (!lastClose) return null;
  const vote = {
    endsAt: playAgainEndsAt(lastClose),
    chosen: game.players.filter((player) => player.playAgain).length,
    players: game.players.length,
  };
  if (now !== undefined && vote.chosen === 0 && now.getTime() > vote.endsAt.getTime()) return null;
  return vote;
}

// Ends the vote: players who did not choose "Play again" are removed, and the room goes back to the lobby with the
// same settings. If the room creator did not choose it, the role passes at random to an account holder who did,
// preferring one who is not away. Without such an account holder the room closes for everyone. A lobby that is
// already full (a Duel where both chose "Play again") starts its next game at once, as a full room always does.
async function endVote(db: TransactionDb, room: Room, game: RoomGame, now: Date, random: () => number) {
  const voters = game.players.filter((player) => player.playAgain);
  const creatorId = await creatorPlayerId(db, room.id);
  const creatorStays = voters.some((player) => player.id === creatorId);
  const newCreator = creatorStays
    ? null
    : pickNewCreator(
        voters.map((player) => ({ ...player, away: isAway(player.lastSeenAt, now) })),
        random,
      );
  const closeReason =
    voters.length === 0 ? "everyone-left" : !creatorStays && newCreator === null ? "no-account-holder" : null;

  const ended = await endPlayAgainVote(db, {
    roomId: room.id,
    gameId: room.gameId!,
    now,
    newCreatorId: newCreator?.id ?? null,
    closeReason,
  });
  if (!ended || closeReason !== null) return;
  if (voters.length >= MAX_PLAYERS_BY_TYPE[room.settings.type]) {
    const lobby = await getRoomByCode(db, room.code);
    if (lobby !== null) await startGameNow(db, lobby, now, random);
  }
}

// POST /api/rooms/[code]/play-again – a player chooses "Play again" after a game (issue #43). Choosing "Leave" is
// the leave route. Refused during a game ("not-finished"), after the last game a room may host ("no-more-games")
// and once the 60 s to choose are over ("vote-over"). The vote ends on the next state request once everyone has
// chosen or the time is up.
export async function playAgainInRoom(
  db: TransactionDb,
  code: string,
  authorization: string | null,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  const at = now();
  const found = await findRoomAsPlayer(db, code, authorization, at);
  if (!found.ok) return found.result;
  const { room, player } = found;

  if (room.status !== "finished") return fail("not-finished");
  const vote = playAgainVote(room, await loadRoomGame(db, room));
  if (vote === null) return fail("no-more-games");
  if (isPlayAgainVoteOver({ ...vote, chosen: 0 }, at)) return fail("vote-over");

  // false = the vote ended at this same moment.
  if (!(await choosePlayAgain(db, { roomId: room.id, gameId: room.gameId!, playerId: player.id }))) {
    return fail("vote-over");
  }
  // The last choice ends the vote at once, so the room is back in the lobby (and in the room list) right away.
  const game = await loadRoomGame(db, room);
  const after = playAgainVote(room, game);
  if (after !== null && isPlayAgainVoteOver(after, at)) await endVote(db, room, game, at, deps.random ?? Math.random);
  return { status: 200, body: { playAgain: true } };
}
