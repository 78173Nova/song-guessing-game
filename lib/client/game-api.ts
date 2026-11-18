// The browser's calls to our game server routes. Each call returns the data or a readable message –
// it never throws, so the screen can always show something sensible.
import type { Filters, SongCount } from "../game/filters";
import type { Mode } from "../game/modes";
import type { MatchingCounts } from "../game/rounds";
import type { Answer, AnswerResult, RoundInfo } from "./game-state";

export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your internet connection and try again.";
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; message: string };

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// A failed reply can also carry the server's error code (e.g. "too-few-songs"). Only apiStartGame uses it,
// the other calls pass on the message only.
type PostResult<T> = { ok: true; data: T } | { ok: false; message: string; code?: string };

async function postWithCode<T>(url: string, body: unknown, fetchFn: FetchFn): Promise<PostResult<T>> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: NETWORK_ERROR_MESSAGE };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (!response.ok) {
    const { message, error } = (data ?? {}) as { message?: unknown; error?: unknown };
    return {
      ok: false,
      message: typeof message === "string" ? message : GENERIC_ERROR_MESSAGE,
      ...(typeof error === "string" ? { code: error } : {}),
    };
  }
  return { ok: true, data: data as T };
}

// Also used by account-api.ts and room-api.ts.
export async function post<T>(url: string, body: unknown, fetchFn: FetchFn): Promise<ApiResponse<T>> {
  const result = await postWithCode<T>(url, body, fetchFn);
  return result.ok ? result : { ok: false, message: result.message };
}

export type StartResponse =
  | { ok: true; data: { gameId: string; previewUrls: string[] } }
  // tooFewSongs: too few songs match the chosen filters – the start screen shows the message.
  | { ok: false; message: string; tooFewSongs?: true };

// `fetchFn` is only passed in tests; the browser uses the real fetch. Without a mode or filters, no body is
// sent and the server plays title mode. A filter that is "Any" is left out. `recentGames`: the player's last
// games, newest first, so the server can avoid their songs (left out when empty).
export async function apiStartGame(
  fetchFn: FetchFn = fetch,
  mode?: Mode,
  filters: Filters = {},
  recentGames: string[] = [],
): Promise<StartResponse> {
  const body = {
    ...(mode === undefined ? {} : { mode }),
    ...(filters.genre === undefined ? {} : { genre: filters.genre }),
    ...(filters.decade === undefined ? {} : { decade: filters.decade }),
    ...(recentGames.length === 0 ? {} : { recentGames }),
  };
  const result = await postWithCode<{ gameId: string; previewUrls: string[] }>(
    "/api/games",
    Object.keys(body).length === 0 ? undefined : body,
    fetchFn,
  );
  if (result.ok) return result;
  return { ok: false, message: result.message, ...(result.code === "too-few-songs" ? { tooFewSongs: true as const } : {}) };
}

export function apiNextRound(gameId: string, fetchFn: FetchFn = fetch) {
  return post<RoundInfo>(`/api/games/${encodeURIComponent(gameId)}/next`, undefined, fetchFn);
}

export function apiAnswer(gameId: string, round: number, answer: Answer, fetchFn: FetchFn = fetch) {
  return post<AnswerResult>(`/api/games/${encodeURIComponent(gameId)}/answer`, { round, answer }, fetchFn);
}

export function apiReplace(gameId: string, round: number, fetchFn: FetchFn = fetch) {
  return post<{ round: number; previewUrl: string }>(`/api/games/${encodeURIComponent(gameId)}/replace`, { round }, fetchFn);
}

// Loads the playable songs per genre and decade for the start screen (spec 003, "filter gaps").
// null if anything goes wrong: the screen then greys out nothing, and the server still checks every start.
export async function apiSongCounts(fetchFn: FetchFn = fetch): Promise<SongCount[] | null> {
  try {
    const response = await fetchFn("/api/games/song-counts");
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const counts = (data as { counts?: unknown } | null)?.counts;
    if (!Array.isArray(counts) || !counts.every(isSongCount)) return null;
    return counts;
  } catch {
    return null;
  }
}

function isSongCount(value: unknown): value is SongCount {
  if (typeof value !== "object" || value === null) return false;
  const { genre, decade, count } = value as Record<string, unknown>;
  return typeof genre === "string" && Number.isInteger(decade) && Number.isInteger(count);
}

// Loads the three numbers for the chosen genre + decade on the solo start screen (team feedback 18 Nov, point 7). A
// filter that is "Any" is left out. null if anything goes wrong: the screen then greys out no mode, and the server
// still checks.
export async function apiSoloMatchingSongs(filters: Filters, fetchFn: FetchFn = fetch): Promise<MatchingCounts | null> {
  const query = new URLSearchParams();
  if (filters.genre !== undefined) query.set("genre", filters.genre);
  if (filters.decade !== undefined) query.set("decade", String(filters.decade));
  const url = query.size === 0 ? "/api/games/matching-songs" : `/api/games/matching-songs?${query}`;
  try {
    const response = await fetchFn(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;
    const { songs, titles, artists } = data as Record<string, unknown>;
    if (![songs, titles, artists].every((n) => Number.isInteger(n) && (n as number) >= 0)) return null;
    return { songs: songs as number, titles: titles as number, artists: artists as number };
  } catch {
    return null;
  }
}
