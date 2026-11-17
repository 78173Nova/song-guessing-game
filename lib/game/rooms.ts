// The rules for rooms (spec 002, decision 012). Plain functions: no database, no network.
import { parseAnswerInput } from "./answers";
import { ANSWER_TIME_SECONDS } from "./scoring";

// A room closes this long after it was created, whatever happens in it.
export const ROOM_LIFETIME_HOURS = 3;
// A room whose game has not started closes this long after it was created.
export const LOBBY_LIFETIME_MINUTES = 30;
// Start works only with at least this many players.
export const MIN_PLAYERS_TO_START = 2;
export const NICKNAME_MAX_LENGTH = 20;

// A room code is 6 digits and never starts with 0 (the database has the same rule).
export function isValidRoomCode(code: unknown): code is string {
  return typeof code === "string" && /^[1-9][0-9]{5}$/.test(code);
}

// Checks a nickname. Returns it without the spaces around it, or null if it is not allowed:
// it must be text of 1–20 characters without control characters (new line, tab, ...).
// [...text] counts whole characters, so an emoji counts as one – the same way the database counts.
export function parseNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nickname = value.trim();
  const length = [...nickname].length;
  if (length < 1 || length > NICKNAME_MAX_LENGTH) return null;
  if (/\p{Cc}/u.test(nickname)) return null; // \p{Cc} = every control character
  return nickname;
}

// Reads the token from the request header "Authorization: Bearer <token>".
// A token is 64 hex characters (lib/api/rooms.ts creates them). null = missing or the wrong shape.
export function readBearerToken(header: string | null): string | null {
  const match = /^Bearer ([0-9a-f]{64})$/.exec(header ?? "");
  return match ? match[1] : null;
}

// A room closes 30 minutes after it was created if its game has not started, and 3 hours after it was
// created in any case. Worked out from created_at on every request – no extra column, no background job.
export function isRoomClosed(room: { createdAt: Date; status: "lobby" | "playing" | "finished" }, now: Date): boolean {
  const age = now.getTime() - room.createdAt.getTime();
  if (room.status === "lobby" && age >= LOBBY_LIFETIME_MINUTES * 60 * 1000) return true;
  return age >= ROOM_LIFETIME_HOURS * 60 * 60 * 1000;
}

// Is the answer time of a round over? Exactly 15 seconds still counts, the same as in scoring.ts.
export function isTimeUp(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() > ANSWER_TIME_SECONDS * 1000;
}

// Seconds left in a round for the countdown, between 15 and 0, with one decimal (e.g. 9.4).
export function secondsLeft(startedAt: Date, now: Date): number {
  const leftMs = ANSWER_TIME_SECONDS * 1000 - (now.getTime() - startedAt.getTime());
  const seconds = Math.round(leftMs / 100) / 10;
  return Math.min(ANSWER_TIME_SECONDS, Math.max(0, seconds));
}

// A round closes when every player has answered or the time is up – whichever comes first.
export function isRoundClosed(
  round: { startedAt: Date; answeredCount: number; playerCount: number },
  now: Date,
): boolean {
  const everyoneAnswered = round.playerCount > 0 && round.answeredCount >= round.playerCount;
  return everyoneAnswered || isTimeUp(round.startedAt, now);
}

// The server moves the game forward by itself (issue #33). Round 1 starts this long after Start, so every
// device has time to see the start time and load the first clip.
export const FIRST_ROUND_DELAY_SECONDS = 5;
// Every device shows a round's result for this long after it closes …
export const RESULT_SECONDS = 5;
// … and the next round starts this long after the close: the result, then a few seconds of
// "Next round starting…", so a device that polls a little late still sees the start time before it comes.
export const NEXT_ROUND_DELAY_SECONDS = RESULT_SECONDS + 3;
// After the last round of a set (issue #34): each player's own set summary, then the standings. The next set
// starts after the result, both of these and the same few seconds of "Next round starting…".
export const SET_SUMMARY_SECONDS = 10;
export const SET_STANDINGS_SECONDS = 5;
export const SET_BREAK_SECONDS = SET_SUMMARY_SECONDS + SET_STANDINGS_SECONDS;
// After the last round of the game: the final standings, then the full summary, which stays.
export const FINAL_STANDINGS_SECONDS = 5;

// The moment a closed round closed: when the last player answered if everyone did, otherwise at the end of
// its 15 seconds. Worked out from the stored times, so every request gets the same moment – and with it the
// same start time for the next round – no matter when it notices the close.
export function roundClosedAt(startedAt: Date, answerTimes: Date[], playerCount: number): Date {
  const everyoneAnswered = playerCount > 0 && answerTimes.length >= playerCount;
  if (everyoneAnswered) return new Date(Math.max(...answerTimes.map((time) => time.getTime())));
  return new Date(startedAt.getTime() + ANSWER_TIME_SECONDS * 1000);
}

// When the next round starts after a round that closed at `closedAt`. `endsSet`: that round was the last of its
// set, so the set summary and the standings come first.
export function nextRoundStartsAt(closedAt: Date, endsSet = false): Date {
  const delay = NEXT_ROUND_DELAY_SECONDS + (endsSet ? SET_BREAK_SECONDS : 0);
  return new Date(closedAt.getTime() + delay * 1000);
}

export type ParsedRoomAnswer =
  | { ok: true; round: number; answer: number }
  | { ok: false; error: "malformed" | "invalid-option" };

// Checks the body of an answer in a room: { round: 1, answer: 0–3 }. Same check as the solo game, but
// without "skip" and "timeout": in a room, a player who does not answer simply has no answer.
export function parseRoomAnswerInput(body: unknown): ParsedRoomAnswer {
  const parsed = parseAnswerInput(body);
  if (!parsed.ok) return parsed;
  if (typeof parsed.answer !== "number") return { ok: false, error: "malformed" };
  return { ok: true, round: parsed.round, answer: parsed.answer };
}

// Sorts players by score (highest first) and gives each a rank. Equal scores share a rank and the next
// rank is skipped: 1, 1, 3. A player's rank is 1 + the number of players with more points.
// Players with the same score stay in the order they came in (the order they joined).
export function rankByScore<Player extends { score: number }>(players: Player[]): (Player & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map((player) => ({
    ...player,
    rank: 1 + sorted.filter((other) => other.score > player.score).length,
  }));
}
