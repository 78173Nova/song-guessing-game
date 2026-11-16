// The rules for rooms (spec 002, decision 012). Plain functions: no database, no network.
import { parseAnswerInput } from "./answers";
import { ANSWER_TIME_SECONDS } from "./scoring";

// A room closes this long after it was created.
export const ROOM_LIFETIME_HOURS = 3;
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

// A room expires 3 hours after it was created – worked out from created_at, no extra column.
export function isRoomExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= ROOM_LIFETIME_HOURS * 60 * 60 * 1000;
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
