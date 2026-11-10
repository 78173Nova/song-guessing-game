// The browser's calls to our game server routes. Each call returns the data or a readable message –
// it never throws, so the screen can always show something sensible.
import type { Answer, AnswerResult, RoundInfo } from "./game-state";

export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your internet connection and try again.";
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; message: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function post<T>(url: string, body: unknown, fetchFn: FetchFn): Promise<ApiResponse<T>> {
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
    const message = (data as { message?: unknown } | null)?.message;
    return { ok: false, message: typeof message === "string" ? message : GENERIC_ERROR_MESSAGE };
  }
  return { ok: true, data: data as T };
}

// `fetchFn` is only passed in tests; the browser uses the real fetch.
export function apiStartGame(fetchFn: FetchFn = fetch) {
  return post<{ gameId: string }>("/api/games", undefined, fetchFn);
}

export function apiNextRound(gameId: string, fetchFn: FetchFn = fetch) {
  return post<RoundInfo>(`/api/games/${encodeURIComponent(gameId)}/next`, undefined, fetchFn);
}

export function apiAnswer(gameId: string, round: number, answer: Answer, fetchFn: FetchFn = fetch) {
  return post<AnswerResult>(`/api/games/${encodeURIComponent(gameId)}/answer`, { round, answer }, fetchFn);
}
