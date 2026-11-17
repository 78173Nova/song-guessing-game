// The browser's calls to the room routes, and where a browser tab keeps its room token. Like game-api.ts,
// each call returns the data or a readable message – it never throws.
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, post, type FetchFn } from "./game-api";

export type JoinedRoom = { code: string; playerToken: string; nickname: string };

export type Song = { title: string; artist: string; artworkUrl: string | null; storeUrl: string | null };
export type Standing = { rank: number; nickname: string; score: number };

// The room state every page polls (described in lib/api/rooms.ts, getRoomState). Times are ISO strings on the
// server's clock. correctOption and song only come once the round has closed.
export type RoomState = {
  code: string;
  status: "lobby" | "playing" | "finished";
  role: "creator" | "player";
  players: string[];
  answered: string[]; // who has answered the round in `round` (not what they chose)
  totalRounds: number;
  serverNow: string;
  previewUrls: string[] | null;
  round: {
    number: number;
    status: "open" | "closed";
    startsAt: string;
    endsAt: string;
    options: string[];
    secondsLeft: number;
    answeredCount: number;
    correctOption?: number;
    song?: Song;
  } | null;
  nextRound: { number: number; startsAt: string; options: string[] } | null;
  me: {
    nickname: string;
    score: number;
    rank: number;
    answer: number | null;
    correct: boolean | null;
    points: number | null;
  };
  standings: Standing[];
};

// What a state request can lead to: the state, or why there is none.
//   gone      – no room with this code, or it has closed (the message says which)
//   not-in    – this tab has no seat in the room (no token, or a token the room does not know)
//   error     – the server could not be reached; the lobby keeps the last state and asks again
export type StateResult =
  | { ok: true; state: RoomState }
  | { ok: false; reason: "gone" | "not-in" | "error"; message: string };

const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });

// Creating needs the session cookie, which the browser sends by itself.
export function apiCreateRoom(nickname: string, fetchFn: FetchFn = fetch) {
  return post<JoinedRoom>("/api/rooms", { nickname }, fetchFn);
}

export async function apiJoinRoom(code: string, nickname: string, fetchFn: FetchFn = fetch) {
  const result = await post<{ playerToken: string; nickname: string }>(
    `/api/rooms/${encodeURIComponent(code)}/join`,
    { nickname },
    fetchFn,
  );
  return result.ok ? { ok: true as const, data: { code, ...result.data } } : result;
}

// `post` with the token added to the headers it sets.
const withToken = (token: string, fetchFn: FetchFn): FetchFn => (url, init) =>
  fetchFn(url, { ...init, headers: { ...init?.headers, ...authorization(token) } });

export async function apiStartRoom(code: string, token: string, fetchFn: FetchFn = fetch) {
  return post<{ totalRounds: number }>(`/api/rooms/${encodeURIComponent(code)}/start`, undefined, withToken(token, fetchFn));
}

// The reply only confirms the choice: right or wrong shows in the state once the round has closed.
export async function apiAnswerRoom(code: string, token: string, round: number, answer: number, fetchFn: FetchFn = fetch) {
  return post<{ round: number; answer: number }>(
    `/api/rooms/${encodeURIComponent(code)}/answer`,
    { round, answer },
    withToken(token, fetchFn),
  );
}

// This device could not load a round's clip (issue #41): ask the server to swap that round's song. The reply has
// the new clip. The server allows one swap per round and only before the round starts, so a refusal means the
// round plays with the clip it has.
export async function apiReportClip(code: string, token: string, round: number, fetchFn: FetchFn = fetch) {
  return post<{ round: number; previewUrl: string }>(
    `/api/rooms/${encodeURIComponent(code)}/replace`,
    { round },
    withToken(token, fetchFn),
  );
}

// Without a token the server still says whether the room exists and is open (404 / 409 before 403), so the
// join page can show "This room has closed" before anyone types a nickname.
export async function apiRoomState(code: string, token: string | null, fetchFn: FetchFn = fetch): Promise<StateResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/rooms/${encodeURIComponent(code)}`, {
      cache: "no-store",
      headers: token === null ? undefined : authorization(token),
    });
  } catch {
    return { ok: false, reason: "error", message: NETWORK_ERROR_MESSAGE };
  }
  let data: { message?: unknown } & Partial<RoomState>;
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: "error", message: GENERIC_ERROR_MESSAGE };
  }
  if (response.ok) return { ok: true, state: data as RoomState };
  const message = typeof data.message === "string" ? data.message : GENERIC_ERROR_MESSAGE;
  if (response.status === 404 || response.status === 409) return { ok: false, reason: "gone", message };
  if (response.status === 403) return { ok: false, reason: "not-in", message };
  return { ok: false, reason: "error", message };
}

// The token lives in sessionStorage: it survives a reload of this tab, and a second tab can join as another
// player. Storage can be blocked (private mode, strict settings), so every access is guarded.
const storageKey = (code: string) => `room-token-${code}`;

export function loadRoomToken(code: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(code));
  } catch {
    return null;
  }
}

export function saveRoomToken(code: string, token: string) {
  try {
    sessionStorage.setItem(storageKey(code), token);
  } catch {
    // Without storage the lobby still works until the tab is reloaded.
  }
}

export function forgetRoomToken(code: string) {
  try {
    sessionStorage.removeItem(storageKey(code));
  } catch {
    // nothing to forget
  }
}
