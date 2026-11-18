// What each game route does, step by step: validate the input, load, apply the rules from lib/game,
// save, and build the reply. The route files in app/api/games/ only call these functions.
// The database is passed in, so the tests can use PGlite instead of Neon.
import type { Db } from "../db/client";
import {
  createGame,
  getGameFilters,
  getGameRounds,
  getQuestionTypes,
  getSongIdsOfGames,
  markRoundSent,
  replaceRound,
  saveAnswer,
  type StoredRound,
} from "../db/games";
import { isRoomGame } from "../db/rooms";
import { listSongsWithPreview } from "../db/songs";
import { countByGenreAndDecade, filterSongs, hasFilters, parseFiltersQuery, tooFewSongsMessage } from "../game/filters";
import { checkAnswer, isValidGameId, nextRoundNumber, parseAnswerInput, parseRoundInput } from "../game/answers";
import { parseStartInput } from "../game/modes";
import { songPools } from "../game/recent-songs";
import { buildReplacementRound, buildRounds, countMatching, type BuildResult } from "../game/rounds";
import { MUSIC_UNAVAILABLE_MESSAGE } from "../music/itunes";

export type ApiResult = { status: number; body: Record<string, unknown> };

type Deps = { now?: () => Date };

// Reads a small JSON body; not ok if it is too long or not JSON. Also used by lib/api/rooms.ts.
export function readJson(rawBody: string): { ok: true; body: unknown } | { ok: false } {
  if (rawBody.length > MAX_BODY_LENGTH) return { ok: false };
  try {
    return { ok: true, body: JSON.parse(rawBody) };
  } catch {
    return { ok: false };
  }
}

// Request bodies are tiny ({"round":1,"answer":2}, {"mode":"year"}). Anything bigger is refused before parsing.
const MAX_BODY_LENGTH = 1000;

const ERRORS = {
  "not-enough-songs": { status: 503, message: MUSIC_UNAVAILABLE_MESSAGE },
  "game-not-found": { status: 404, message: "This game does not exist." },
  malformed: { status: 400, message: "The request is not valid." },
  "invalid-option": { status: 400, message: "Please choose one of the four answers." },
  "invalid-mode": { status: 400, message: "Please choose one of the game modes: title, artist, year or mixed." },
  "invalid-genre": { status: 400, message: "Please choose a genre from the list." },
  "invalid-decade": { status: 400, message: "Please choose a decade from the list (1960s to 2020s)." },
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

// The rounds of a solo game. null = there is no such game – or the game belongs to a room.
// Room games are closed to the solo routes (spec 002): these routes only ask for a game ID, so otherwise
// anyone who learned the ID could open rounds, answer or swap songs for the whole room.
async function getSoloGameRounds(db: Db, gameId: string): Promise<StoredRound[] | null> {
  if (await isRoomGame(db, gameId)) return null;
  return getGameRounds(db, gameId);
}

// POST /api/games – checks the chosen mode and filters, picks the matching songs (avoiding those of the
// player's last games where possible), builds the rounds, stores the game with its mode and filters.
// Returns its ID and the 5 clip addresses in round order, so the browser can load the clips in advance
// (decision 004, update). No titles and no answers: those only come with "next" and "answer".
// An empty body means title mode with no filters, so callers that send no body keep working.
export async function startGame(
  db: Db,
  random: () => number = Math.random,
  rawBody = "",
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  let body: unknown = undefined;
  if (rawBody.trim() !== "") {
    const json = readJson(rawBody);
    if (!json.ok) return fail("malformed");
    body = json.body;
  }
  const input = parseStartInput(body);
  if (!input.ok) return fail(input.error);

  // The playable songs (listSongsWithPreview decides which those are), then only the ones matching the filters.
  // The wrong options come from the same matching songs.
  const filters = { genre: input.genre, decade: input.decade };
  const songs = filterSongs(await listSongsWithPreview(db), filters);

  // Avoid the songs of the player's last games where possible: first all of them, then fewer, then none
  // (songPools). The first list that can fill a game in this mode is used.
  const recentSongIds = await getSongIdsOfGames(db, input.recentGames ?? []);
  let built: BuildResult = { ok: false, reason: "not-enough-songs" };
  for (const pool of songPools(songs, recentSongIds)) {
    built = buildRounds(pool, random, { mode: input.mode, currentYear: now().getFullYear() });
    if (built.ok) break;
  }
  if (!built.ok) {
    // With filters, the player can fix it by choosing other filters. Without, the music is unavailable.
    if (!hasFilters(filters)) return fail("not-enough-songs");
    return { status: 422, body: { error: "too-few-songs", message: tooFewSongsMessage(songs.length) } };
  }

  const gameId = await createGame(db, built.rounds, input.mode, filters);
  const previewUrls = built.rounds.map((round) => songs.find((s) => s.id === round.songId)!.previewUrl);
  return { status: 201, body: { gameId, previewUrls } };
}

// GET /api/games/song-counts – how many playable songs each genre + decade has, so the start screen can grey out
// choices with too few (spec 003, "filter gaps"). Only counts: no titles, artists, years or song IDs.
// startGame still refuses a combination with too few songs on its own.
export async function getSongCounts(db: Db): Promise<ApiResult> {
  return { status: 200, body: { counts: countByGenreAndDecade(await listSongsWithPreview(db)) } };
}

// GET /api/games/matching-songs?genre=rock&decade=1980 – for one genre + decade (missing = Any), only three
// numbers: playable songs, different titles, different artists (team feedback 18 Nov, point 7). The solo start
// screen shows the count and greys out modes that cannot start. startGame still refuses such a game on its own.
export async function getMatchingSongs(db: Db, params: URLSearchParams): Promise<ApiResult> {
  const parsed = parseFiltersQuery(params);
  if (!parsed.ok) return fail(parsed.error);
  const songs = filterSongs(await listSongsWithPreview(db), parsed.filters);
  return { status: 200, body: countMatching(songs) };
}

// POST /api/games/[id]/next – sends the next round without the correct answer and notes the time.
export async function sendNextRound(db: Db, gameId: string, deps: Deps = {}): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  if (!isValidGameId(gameId)) return fail("game-not-found");

  const rounds = await getSoloGameRounds(db, gameId);
  if (rounds === null) return fail("game-not-found");

  const next = nextRoundNumber(rounds);
  if (!next.ok) return fail(next.error);

  // Only succeeds if the round is still waiting – protects against two "next" requests at once.
  if (!(await markRoundSent(db, gameId, next.roundNumber, now()))) return fail("round-still-open");

  const round = rounds[next.roundNumber - 1];
  const questionTypes = await getQuestionTypes(db, gameId);
  // Only these five fields – nothing that reveals the answer (decision 004). The question type only says
  // what is asked ("Which year?"), not which option is right.
  return {
    status: 200,
    body: {
      round: round.roundNumber,
      totalRounds: rounds.length,
      previewUrl: round.song.previewUrl,
      options: round.options,
      questionType: questionTypes![next.roundNumber - 1],
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

  const rounds = await getSoloGameRounds(db, gameId);
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
        year: round.song.year,
        artworkUrl: round.song.artworkUrl,
        storeUrl: round.song.storeUrl,
      },
    },
  };
}

// POST /api/games/[id]/replace – the browser could not load a round's clip: give that round another song
// (not in the game yet, matching the game's filters) with 4 new options. Only for rounds that have not started
// (decision 006, update).
export async function replaceRoundSong(
  db: Db,
  gameId: string,
  rawBody: string,
  random: () => number = Math.random,
  deps: Deps = {},
): Promise<ApiResult> {
  const now = deps.now ?? (() => new Date());
  if (!isValidGameId(gameId)) return fail("game-not-found");
  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const input = parseRoundInput(json.body);
  if (!input.ok) return fail(input.error);

  const rounds = await getSoloGameRounds(db, gameId);
  if (rounds === null) return fail("game-not-found");
  if (input.round > rounds.length) return fail("round-out-of-range");
  if (rounds[input.round - 1].status !== "waiting") return fail("round-already-started");

  // The new song gets options of the same question type as before (a "Which year?" round stays one).
  const questionTypes = await getQuestionTypes(db, gameId);
  const filters = await getGameFilters(db, gameId);
  if (questionTypes === null || filters === null) return fail("game-not-found");
  const songs = filterSongs(await listSongsWithPreview(db), filters);
  const built = buildReplacementRound(songs, rounds.map((r) => r.songId), input.round, random, {
    questionType: questionTypes[input.round - 1],
    currentYear: now().getFullYear(),
  });
  if (!built.ok) return fail("not-enough-songs");

  // Only succeeds if the round is still waiting.
  if (!(await replaceRound(db, gameId, built.round))) return fail("round-already-started");

  const previewUrl = songs.find((s) => s.id === built.round.songId)!.previewUrl;
  return { status: 200, body: { round: input.round, previewUrl } };
}
