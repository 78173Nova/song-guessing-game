// Small pieces that lib/api/accounts.ts and lib/api/rooms.ts both need, so each rule and message lives in one place.
import { looksLikeToken } from "../accounts/rules";
import type { TransactionDb } from "../db/client";
import { findSessionAccount, type SessionAccount } from "../db/accounts";

// Is this parsed JSON body an object such as { "nickname": "Anna" }? Not null, not a list, not a number or a text.
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
