// The rules for accounts, without database or network: what a valid username, email and password look like,
// password hashing, email-link tokens and how long they last (spec 004, decision 014).
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// A verification link is valid for 24 hours.
export const VERIFY_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

// A password reset link is valid for 1 hour.
export const RESET_LINK_LIFETIME_MS = 60 * 60 * 1000;

// At most one email per address every 60 seconds, so a form cannot be used to flood someone's inbox.
export const EMAIL_THROTTLE_MS = 60_000;

// A login session lasts 30 days.
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

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

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

// Password: 8–128 characters and no spaces (no whitespace at all: a space typed by mistake at the start or end
// would otherwise lock people out). Counted in Unicode characters, so a simple emoji counts as one.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function isValidPassword(password: string): boolean {
  const length = [...password].length;
  return length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH && !/\s/.test(password);
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

// Checks a password against a stored "scrypt$<salt>$<hash>". Pass null when there is no account: then a dummy
// hash is checked instead and the answer is always false, so an unknown account takes as long as a wrong
// password and the time of the reply does not tell whether an account exists.
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(KEY_LENGTH * 2)}`;

export async function checkPassword(password: string, storedHash: string | null): Promise<boolean> {
  const [scheme, saltHex, hashHex] = (storedHash ?? DUMMY_HASH).split("$");
  const expected = Buffer.from(hashHex ?? "", "hex");
  if (scheme !== "scrypt" || !saltHex || expected.length !== KEY_LENGTH) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  // Compares every byte, however early they differ, so the time does not show how much of the hash matched.
  return timingSafeEqual(actual, expected) && storedHash !== null;
}

export type LoginInput = { by: "email" | "username"; value: string; password: string };

// Checks the login form: { login, password }. A login with @ is an email (stored lowercase), otherwise a
// username (compared ignoring case). Values longer than any real email or password are refused here, so a
// huge value never reaches scrypt.
export function parseLoginInput(body: unknown): { ok: true; input: LoginInput } | { ok: false } {
  if (typeof body !== "object" || body === null) return { ok: false };
  const { login, password } = body as Record<string, unknown>;
  if (typeof login !== "string" || typeof password !== "string") return { ok: false };
  const value = login.trim();
  if (value.length > MAX_EMAIL_LENGTH || [...password].length > MAX_PASSWORD_LENGTH) return { ok: false };
  if (value.includes("@")) return { ok: true, input: { by: "email", value: value.toLowerCase(), password } };
  return { ok: true, input: { by: "username", value, password } };
}

// Checks a form with only an email: { email } (forgot password, "Send the email again"). The email comes back
// lowercase.
export function parseEmailInput(
  body: unknown,
): { ok: true; email: string } | { ok: false; error: "malformed" | "invalid-email" } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "malformed" };
  const { email } = body as Record<string, unknown>;
  if (typeof email !== "string") return { ok: false, error: "malformed" };
  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) return { ok: false, error: "invalid-email" };
  return { ok: true, email: trimmed.toLowerCase() };
}

// Link and session tokens are 43 characters; anything empty or much longer is not one of ours.
const MAX_TOKEN_LENGTH = 200;

export function looksLikeToken(token: unknown): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN_LENGTH;
}

// Checks the body of the verify-email page: { token }.
export function parseTokenInput(body: unknown): { ok: true; token: string } | { ok: false } {
  const token = (body as { token?: unknown } | null)?.token;
  return looksLikeToken(token) ? { ok: true, token } : { ok: false };
}

// Checks the reset page: { token, password }. The new password follows the same rule (8–128 characters, no spaces) as at
// sign-up.
export function parseResetPasswordInput(
  body: unknown,
): { ok: true; token: string; password: string } | { ok: false; error: "malformed" | "invalid-password" } {
  const { token, password } = (body ?? {}) as { token?: unknown; password?: unknown };
  if (!looksLikeToken(token) || typeof password !== "string") return { ok: false, error: "malformed" };
  if (!isValidPassword(password)) return { ok: false, error: "invalid-password" };
  return { ok: true, token, password };
}

export type TeamAccount = { email: string; username: string; password: string };

// Reads TEAM_ACCOUNTS: accounts the team creates ahead of time, already verified (decision 014), as
// "email|username|password;email|username|password;…". The values live only in environment variables, never in
// the repository. Spaces around each part and empty entries are ignored; the email comes back lowercase.
export function parseTeamAccounts(value: string | undefined): { ok: true; accounts: TeamAccount[] } | { ok: false; error: string } {
  const entries = (value ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) return { ok: false, error: "TEAM_ACCOUNTS is empty" };

  const accounts: TeamAccount[] = [];
  for (const [index, entry] of entries.entries()) {
    // Errors name the entry by its number and never repeat its content, so a password never reaches the terminal.
    const where = `Entry ${index + 1} of TEAM_ACCOUNTS`;
    const parts = entry.split("|").map((part) => part.trim());
    if (parts.length !== 3) return { ok: false, error: `${where} needs email|username|password` };
    const [email, username, password] = parts;
    const checked = parseSignupInput({ email, username, password });
    if (!checked.ok) return { ok: false, error: `${where} ${TEAM_ACCOUNT_ERRORS[checked.error]}` };
    if (accounts.some((a) => a.email === checked.input.email)) return { ok: false, error: `${where} repeats an email` };
    if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
      return { ok: false, error: `${where} repeats a username` };
    }
    accounts.push(checked.input);
  }
  return { ok: true, accounts };
}

const TEAM_ACCOUNT_ERRORS = {
  malformed: "needs email|username|password",
  "invalid-email": "has an invalid email",
  "invalid-username": "has a username that is not 3–20 letters, digits or _",
  "invalid-password": "has a password that is not 8–128 characters without spaces",
} as const;

// Checks a new username on the Account settings page: { username }, same rule as at sign-up (issue #45).
export function parseUsernameInput(
  body: unknown,
): { ok: true; username: string } | { ok: false; error: "malformed" | "invalid-username" } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "malformed" };
  const { username } = body as Record<string, unknown>;
  if (typeof username !== "string") return { ok: false, error: "malformed" };
  if (!USERNAME_PATTERN.test(username)) return { ok: false, error: "invalid-username" };
  return { ok: true, username };
}

// Checks a password change on the Account settings page: { currentPassword, newPassword }. The new password follows
// the sign-up rule (8–128 characters, no spaces). A current password longer than any real one is refused here, so
// a huge value never reaches scrypt.
export function parsePasswordChangeInput(
  body: unknown,
):
  | { ok: true; currentPassword: string; newPassword: string }
  | { ok: false; error: "malformed" | "invalid-password" } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "malformed" };
  const { currentPassword, newPassword } = body as Record<string, unknown>;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") return { ok: false, error: "malformed" };
  if ([...currentPassword].length > MAX_PASSWORD_LENGTH) return { ok: false, error: "malformed" };
  if (!isValidPassword(newPassword)) return { ok: false, error: "invalid-password" };
  return { ok: true, currentPassword, newPassword };
}

// Checks an email change on the Account settings page: { email, password }. The new email comes back trimmed and
// lowercase. A password longer than any real one is refused here, so a huge value never reaches scrypt.
export function parseEmailChangeInput(
  body: unknown,
): { ok: true; email: string; password: string } | { ok: false; error: "malformed" | "invalid-email" } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "malformed" };
  const { password } = body as Record<string, unknown>;
  if (typeof password !== "string" || [...password].length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: "malformed" };
  }
  const parsed = parseEmailInput(body);
  return parsed.ok ? { ok: true, email: parsed.email, password } : parsed;
}
