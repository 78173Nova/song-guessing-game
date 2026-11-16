// The rules for accounts, without database or network: what a valid username, email and password look like,
// password hashing, email-link tokens and how long they last (spec 004, decision 014).
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// A verification link is valid for 24 hours.
export const VERIFY_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type SignupInput = { email: string; username: string; password: string };

export type SignupInputResult =
  | { ok: true; input: SignupInput }
  | { ok: false; error: "malformed" | "invalid-email" | "invalid-username" | "invalid-password" };

// Checks the sign-up form. The email comes back lowercase; the username keeps the case it was typed in.
export function parseSignupInput(body: unknown): SignupInputResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "malformed" };
  const { email, username, password } = body as Record<string, unknown>;
  if (typeof email !== "string" || typeof username !== "string" || typeof password !== "string") {
    return { ok: false, error: "malformed" };
  }
  if (!isValidEmail(email)) return { ok: false, error: "invalid-email" };
  if (!USERNAME_PATTERN.test(username)) return { ok: false, error: "invalid-username" };
  if (!isValidPassword(password)) return { ok: false, error: "invalid-password" };
  return { ok: true, input: { email: email.toLowerCase(), username, password } };
}

// Username: 3–20 characters, only English letters, digits and _. So it never contains @, and login can tell
// a username from an email. The database checks the same pattern.
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

// Email: looks like one – exactly one @, a dot somewhere after it, no spaces, at most 254 characters.
// Whether it really exists is shown only when someone opens the link we send to it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

// Password: 8–128 characters, no other rules. Counted in Unicode characters, so a simple emoji counts as one.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function isValidPassword(password: string): boolean {
  const length = [...password].length;
  return length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH;
}

// A long random token for links in emails (32 random bytes = 43 characters). Only its hash is stored.
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

// Password hashing with scrypt (Node's built-in crypto, no extra package). Each password gets its own random
// salt, so two people with the same password get different hashes. Stored as "scrypt$<salt>$<hash>" in hex.
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

