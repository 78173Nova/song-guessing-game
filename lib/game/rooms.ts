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
// A room that went back to the lobby after a game (issue #43) counts its 30 minutes from `lobbySince`.
export function isRoomClosed(
  room: { createdAt: Date; status: "lobby" | "playing" | "finished"; lobbySince?: Date | null },
  now: Date,
): boolean {
  const age = now.getTime() - room.createdAt.getTime();
  const inLobby = now.getTime() - (room.lobbySince ?? room.createdAt).getTime();
  if (room.status === "lobby" && inLobby >= LOBBY_LIFETIME_MINUTES * 60 * 1000) return true;
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
// When a round's song is swapped (issue #41), every device needs this long to load the new clip. A round that would
// start sooner starts this long after the swap instead – so it starts at most this much later than planned.
export const SWAP_LOAD_SECONDS = 5;

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

// The lobby countdown of public rooms (issue #37). It runs from the moment the lobby has 2 players; at its end
// the game starts by itself. In the last EXTEND_WINDOW_SECONDS the room creator may add EXTEND_SECONDS, at most
// MAX_EXTENSIONS times. Exactly 15 s left already counts as the last 15 s.
export const LOBBY_COUNTDOWN_SECONDS = 60;
export const EXTEND_SECONDS = 60;
export const EXTEND_WINDOW_SECONDS = 15;
export const MAX_EXTENSIONS = 5;

export function countdownEndsAt(from: Date, extensions: number): Date {
  return new Date(from.getTime() + (LOBBY_COUNTDOWN_SECONDS + extensions * EXTEND_SECONDS) * 1000);
}

export function isCountdownOver(endsAt: Date, now: Date): boolean {
  return now.getTime() >= endsAt.getTime();
}

// Why "Extend +60 s" does not work right now, or null if it does (the room creator check is the caller's).
export function whyNoExtension(
  countdown: { endsAt: Date; extensions: number },
  now: Date,
): "too-early-to-extend" | "no-more-extensions" | null {
  if (countdown.extensions >= MAX_EXTENSIONS) return "no-more-extensions";
  if (countdown.endsAt.getTime() - now.getTime() > EXTEND_WINDOW_SECONDS * 1000) return "too-early-to-extend";
  return null;
}

// Away and kick (issue #40). Every device asks for the room state every 1–2 seconds, so a player whose device
// has not asked for AWAY_SECONDS is away (closed the tab, lost the connection, phone locked). Exactly 5 s counts
// as away. The room creator can kick a player who has been away for more than KICK_AFTER_AWAY_SECONDS.
export const AWAY_SECONDS = 5;
export const KICK_AFTER_AWAY_SECONDS = 60;

export function isAway(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= AWAY_SECONDS * 1000;
}

// The latest last-seen time a player may have and still be kicked at `now`: more than 60 s away.
export function kickableIfSeenBefore(now: Date): Date {
  return new Date(now.getTime() - (AWAY_SECONDS + KICK_AFTER_AWAY_SECONDS) * 1000);
}

// Play again (issue #43). A room hosts at most MAX_GAMES_PER_ROOM games. After a game, each player has
// PLAY_AGAIN_SECONDS to choose "Play again" or "Leave", counted from the end screen (the result of the last round,
// then the final standings). Exactly at the end still counts.
export const MAX_GAMES_PER_ROOM = 5;
export const PLAY_AGAIN_SECONDS = 60;

// When the vote after a game ends, from the moment its last round closed.
export function playAgainEndsAt(lastRoundClosedAt: Date): Date {
  const seconds = RESULT_SECONDS + FINAL_STANDINGS_SECONDS + PLAY_AGAIN_SECONDS;
  return new Date(lastRoundClosedAt.getTime() + seconds * 1000);
}

// The vote is over once every player still in the room has chosen, or its time has passed.
export function isPlayAgainVoteOver(vote: { endsAt: Date; chosen: number; players: number }, now: Date): boolean {
  return vote.chosen >= vote.players || now.getTime() > vote.endsAt.getTime();
}

// Who becomes the room creator when the room creator did not choose "Play again": one of the account holders who
// chose it, at random, preferring those who are not away (lib/game/rooms.ts isAway) at that moment.
// null = no account holder chose it, so nobody can run the room.
export function pickNewCreator<Player extends { hasAccount: boolean; away: boolean }>(
  voters: Player[],
  random: () => number,
): Player | null {
  const accountHolders = voters.filter((player) => player.hasAccount);
  const present = accountHolders.filter((player) => !player.away);
  const pool = present.length > 0 ? present : accountHolders;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
