// The browser's calls to the room routes, and where a browser tab keeps its room token. Like game-api.ts,
// each call returns the data or a readable message – it never throws.
import type { QuestionType } from "../game/modes";
import type { RoomSettings } from "../game/room-settings";
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, post, type FetchFn } from "./game-api";

export type JoinedRoom = { code: string; playerToken: string; nickname: string };

export type Song = { title: string; artist: string; artworkUrl: string | null; storeUrl: string | null };
// One closed round in the player's set summary (issue #34).
export type SummaryItem = {
  round: number;
  set: number;
  title: string;
  artist: string;
  storeUrl: string | null;
  correct: boolean;
  points: number;
};
export type Standing = { rank: number; nickname: string; score: number };

// The room state every page polls (described in lib/api/rooms.ts, getRoomState). Times are ISO strings on the
// server's clock. correctOption and song only come once the round has closed.
export type RoomState = {
  code: string;
  status: "lobby" | "playing" | "finished";
  role: "creator" | "player";
  players: string[];
  avatars?: Record<string, string>; // each player's avatar id by nickname (issue #44); missing = music note
  settings?: RoomSettings; // fixed when the room was created (issue #34)
  startingPlayers?: number | null; // how many players the game started with; null in the lobby (issue #39)
  answered: string[]; // who has answered the round in `round` (not what they chose)
  away?: string[]; // players whose device has not asked for 5 s (issue #40)
  kickable?: string[]; // players the room creator may kick now; always empty for other players
  totalRounds: number;
  gameNumber?: number; // which of the room's games (1–5) this is, or the next one in the lobby (issue #43)
  // After a game: when the vote on "Play again" ends and who has chosen it. null otherwise and after the 5th game.
  playAgain?: { endsAt: string; chosen: string[] } | null;
  serverNow: string;
  previewUrls: string[] | null;
  round: {
    number: number;
    status: "open" | "closed";
    startsAt: string;
    endsAt: string;
    options: string[];
    questionType?: QuestionType;
    secondsLeft: number;
    answeredCount: number;
    correctOption?: number;
    song?: Song;
  } | null;
  nextRound: { number: number; startsAt: string; options: string[]; questionType?: QuestionType } | null;
  me: {
    nickname: string;
    score: number;
    rank: number;
    answer: number | null;
    correct: boolean | null;
    points: number | null;
    summary?: SummaryItem[]; // every closed round with this player's result
  };
  standings: Standing[];
};

// What a state request can lead to: the state, or why there is none.
//   gone      – no room with this code, or it has closed (the message says which)
//   not-in    – this tab has no seat in the room (no token, or a token the room does not know)
//   removed   – this tab left the game or was kicked (issue #40): no nickname form, just the message
//   error     – the server could not be reached; the lobby keeps the last state and asks again
export type StateResult =
  | { ok: true; state: RoomState }
  | { ok: false; reason: "gone" | "not-in" | "removed" | "error"; message: string };

const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });

// What a player picks on the nickname screen (issue #44).
export type NicknameChoice = { nickname: string; avatar: string };

// Creating needs the session cookie, which the browser sends by itself. Without settings the server uses the
// default ones.
export function apiCreateRoom(choice: NicknameChoice, fetchFn: FetchFn = fetch, settings?: RoomSettings) {
  return post<JoinedRoom>("/api/rooms", settings === undefined ? choice : { ...choice, settings }, fetchFn);
}

// How many songs match these genres and decades, for the create form. null = the server could not say.
export async function apiMatchingSongs(
  choice: Pick<RoomSettings, "genres" | "decades">,
  fetchFn: FetchFn = fetch,
): Promise<number | null> {
  const list = (value: "any" | (string | number)[]) => (value === "any" ? "any" : value.join(","));
  const query = new URLSearchParams({ genres: list(choice.genres), decades: list(choice.decades) });
  try {
    const response = await fetchFn(`/api/rooms/matching-songs?${query}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { count?: unknown };
    return typeof data.count === "number" ? data.count : null;
  } catch {
    return null;
  }
}

// The browser also sends the session cookie of an account holder, so the server can save a first avatar (issue #44).
// `oldToken`: the token this tab had in the room before, if any. The server refuses the join when that token was
// kicked (issue #40).
export async function apiJoinRoom(
  code: string,
  choice: NicknameChoice,
  fetchFn: FetchFn = fetch,
  oldToken: string | null = null,
) {
  const result = await post<{ playerToken: string; nickname: string }>(
    `/api/rooms/${encodeURIComponent(code)}/join`,
    choice,
    oldToken === null ? fetchFn : withToken(oldToken, fetchFn),
  );
  return result.ok ? { ok: true as const, data: { code, ...result.data } } : result;
}

// Leave the room (issue #40). roomClosed = the room creator left the lobby, so the room closed for everyone.
export async function apiLeaveRoom(code: string, token: string, fetchFn: FetchFn = fetch) {
  return post<{ left: true; roomClosed: boolean }>(
    `/api/rooms/${encodeURIComponent(code)}/leave`,
    undefined,
    withToken(token, fetchFn),
  );
}

// "Play again" after a game (issue #43). "Leave" is apiLeaveRoom.
export async function apiPlayAgain(code: string, token: string, fetchFn: FetchFn = fetch) {
  return post<{ playAgain: true }>(`/api/rooms/${encodeURIComponent(code)}/play-again`, undefined, withToken(token, fetchFn));
}

// The room creator kicks a player who has been away for more than 60 s (issue #40). The page asks first.
export async function apiKickPlayer(code: string, token: string, nickname: string, fetchFn: FetchFn = fetch) {
  return post<{ nickname: string }>(
    `/api/rooms/${encodeURIComponent(code)}/kick`,
    { nickname },
    withToken(token, fetchFn),
  );
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
  let data: { message?: unknown; error?: unknown } & Partial<RoomState>;
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: "error", message: GENERIC_ERROR_MESSAGE };
  }
  if (response.ok) return { ok: true, state: data as RoomState };
  const message = typeof data.message === "string" ? data.message : GENERIC_ERROR_MESSAGE;
  if (response.status === 404 || response.status === 409) return { ok: false, reason: "gone", message };
  if (response.status === 403) {
    const removed = data.error === "kicked" || data.error === "left";
    return { ok: false, reason: removed ? "removed" : "not-in", message };
  }
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
