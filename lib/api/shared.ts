// Small pieces that lib/api/accounts.ts and lib/api/rooms.ts both need, so each rule and message lives in one place.
import { looksLikeToken } from "../accounts/rules";
import type { TransactionDb } from "../db/client";
import { findSessionAccount, type SessionAccount } from "../db/accounts";

// Is this parsed JSON body an object such as { "nickname": "Anna" }? Not null, not a list, not a number or a text.
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// What the server log gets for an unexpected error: its kind and database code (e.g. "NeonDbError 23514"),
// never its text. A database error's message or detail can contain an email, part of a password hash or, with a
// broken DATABASE_URL, the connection string. Anything thrown that is not an Error is "unknown error".
export function errorSummary(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,10}$/.test(code) ? `${error.name} ${code}` : error.name;
}

// The errors for a nickname or an avatar, the same in rooms and in Account settings (issue #44).
export const PLAYER_INPUT_ERRORS = {
  "invalid-nickname": { status: 400, message: "Please choose a nickname with 1 to 20 characters." },
  "invalid-avatar": { status: 400, message: "Please choose one of the avatars." },
} as const;

// Looks up what belongs to a session cookie with `find`. null when there is no cookie or it cannot be a token, so
// a made-up value never reaches the database.
export async function findBySession<T>(
  sessionToken: string | undefined,
  find: (token: string) => Promise<T | null>,
): Promise<T | null> {
  return looksLikeToken(sessionToken) ? find(sessionToken) : null;
}

// The account of a session cookie, or null for a guest (no, an unknown or an expired session).
export function sessionAccount(
  db: TransactionDb,
  sessionToken: string | undefined,
  now: Date,
): Promise<SessionAccount | null> {
  return findBySession(sessionToken, (token) => findSessionAccount(db, token, now));
}
