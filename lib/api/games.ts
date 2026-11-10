// What each game route does, step by step: validate the input, load, apply the rules from lib/game,
// save, and build the reply. The route files in app/api/games/ only call these functions.
// The database is passed in, so the tests can use PGlite instead of Neon.
import type { Db } from "../db/client";
import { createGame, getGameRounds, markRoundSent, replaceRound, saveAnswer } from "../db/games";
import { listSongsWithPreview } from "../db/songs";
import { checkAnswer, isValidGameId, nextRoundNumber, parseAnswerInput, parseRoundInput } from "../game/answers";
import { buildReplacementRound, buildRounds } from "../game/rounds";
import { MUSIC_UNAVAILABLE_MESSAGE } from "../music/itunes";

export type ApiResult = { status: number; body: Record<string, unknown> };

type Deps = { now?: () => Date };

// Reads a small JSON body; null if it is too long or not JSON.
function readJson(rawBody: string): { ok: true; body: unknown } | { ok: false } {
  if (rawBody.length > MAX_BODY_LENGTH) return { ok: false };
  try {
    return { ok: true, body: JSON.parse(rawBody) };
  } catch {
    return { ok: false };
  }
}

// Answer bodies are tiny ({"round":1,"answer":2}). Anything bigger is refused before parsing.
const MAX_BODY_LENGTH = 1000;

const ERRORS = {
  "not-enough-songs": { status: 503, message: MUSIC_UNAVAILABLE_MESSAGE },
  "game-not-found": { status: 404, message: "This game does not exist." },
  malformed: { status: 400, message: "The request is not valid." },
  "invalid-option": { status: 400, message: "Please choose one of the four answers." },
  "round-out-of-range": { status: 400, message: "This round does not exist in this game." },
  "round-not-sent": { status: 409, message: "This round has not started yet." },
  "already-answered": { status: 409, message: "This round was already answered." },
  "round-still-open": { status: 409, message: "Please answer the current round first." },
  "game-finished": { status: 409, message: "The game is over – there are no more rounds." },
  "round-already-started": { status: 409, message: "This round has already started." },
  "server-error": { status: 500, message: "Something went wrong on the server. Please try again." },
} as const;

type ErrorCode = keyof typeof ERRORS;

function fail(error: ErrorCode): ApiResult {
  return { status: ERRORS[error].status, body: { error, message: ERRORS[error].message } };
}

// Runs a request and turns any unexpected error (database down, DATABASE_URL missing, ...) into a 500
// with a generic message. The details go to the server log only, never to the browser.
export async function safely(run: () => Promise<ApiResult>): Promise<ApiResult> {
  try {
    return await run();
  } catch (error) {
    console.error("Game API error:", error);
    return fail("server-error");
  }
}

// POST /api/games – picks the songs, builds the rounds, stores the game. Returns its ID and the 5 clip
// addresses in round order, so the browser can load the clips in advance (decision 004, update).
// No titles and no answers: those only come with "next" and "answer".
export async function startGame(db: Db, random: () => number = Math.random): Promise<ApiResult> {
  const songs = await listSongsWithPreview(db);
  const built = buildRounds(songs, random);
  if (!built.ok) return fail("not-enough-songs");

  const gameId = await createGame(db, built.rounds);
  const previewUrls = built.rounds.map((round) => songs.find((s) => s.id === round.songId)!.previewUrl);
  return { status: 201, body: { gameId, previewUrls } };
}

// POST /api/games/[id]/next – sends the next round without the correct answer and notes the time.
export async function sendNextRound(db: Db, gameId: string, deps: Deps = {}): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  if (!isValidGameId(gameId)) return fail("game-not-found");

  const rounds = await getGameRounds(db, gameId);
  if (rounds === null) return fail("game-not-found");

  const next = nextRoundNumber(rounds);
  if (!next.ok) return fail(next.error);

  // Only succeeds if the round is still waiting – protects against two "next" requests at once.
  if (!(await markRoundSent(db, gameId, next.roundNumber, now()))) return fail("round-still-open");

  const round = rounds[next.roundNumber - 1];
  // Only these four fields – nothing that reveals the answer (decision 004).
  return {
    status: 200,
    body: {
      round: round.roundNumber,
      totalRounds: rounds.length,
      previewUrl: round.song.previewUrl,
      options: round.options,
    },
  };
}

// POST /api/games/[id]/answer – checks the answer, stores it, returns the result and the correct song.
export async function answerRound(
  db: Db,
  gameId: string,
  rawBody: string,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  if (!isValidGameId(gameId)) return fail("game-not-found");

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const input = parseAnswerInput(json.body);
  if (!input.ok) return fail(input.error);

  const rounds = await getGameRounds(db, gameId);
  if (rounds === null) return fail("game-not-found");
  if (input.round > rounds.length) return fail("round-out-of-range");

  const round = rounds[input.round - 1];
  const answeredAt = now();
  const result = checkAnswer(round, input.answer, answeredAt);
  if (!result.ok) return fail(result.error);

  // Only succeeds if the round is still open – a second answer cannot count, even at the same moment.
  const saved = await saveAnswer(db, gameId, round.roundNumber, {
    status: result.status,
    chosenOption: result.chosenOption,
    points: result.points,
    answeredAt,
  });
  if (!saved) return fail("already-answered");

  const earlierPoints = rounds
    .filter((r) => r.roundNumber !== round.roundNumber)
    .reduce((sum, r) => sum + (r.points ?? 0), 0);

  return {
    status: 200,
    body: {
      correct: result.correct,
      points: result.points,
      totalScore: earlierPoints + result.points,
      correctOption: round.correctOption,
      song: {
        title: round.song.title,
        artist: round.song.artist,
        artworkUrl: round.song.artworkUrl,
        storeUrl: round.song.storeUrl,
      },
    },
  };
}

// POST /api/games/[id]/replace – the browser could not load a round's clip: give that round another song
// (not in the game yet) with 4 new options. Only for rounds that have not started (decision 006, update).
export async function replaceRoundSong(
  db: Db,
  gameId: string,
  rawBody: string,
  random: () => number = Math.random,
): Promise<ApiResult> {
  if (!isValidGameId(gameId)) return fail("game-not-found");
  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const input = parseRoundInput(json.body);
  if (!input.ok) return fail(input.error);

  const rounds = await getGameRounds(db, gameId);
  if (rounds === null) return fail("game-not-found");
  if (input.round > rounds.length) return fail("round-out-of-range");
  if (rounds[input.round - 1].status !== "waiting") return fail("round-already-started");

  const songs = await listSongsWithPreview(db);
  const built = buildReplacementRound(songs, rounds.map((r) => r.songId), input.round, random);
  if (!built.ok) return fail("not-enough-songs");

  // Only succeeds if the round is still waiting.
  if (!(await replaceRound(db, gameId, built.round))) return fail("round-already-started");

  const previewUrl = songs.find((s) => s.id === built.round.songId)!.previewUrl;
  return { status: 200, body: { round: input.round, previewUrl } };
}
