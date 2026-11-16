// Saving and loading accounts and their email-link tokens. All SQL for accounts lives here.
// Tokens come in as the raw value and are hashed here (SHA-256, like room tokens in decision 012), so a raw
// token can never reach the database. Password hashes are made in lib/accounts before they get here.
import type { TransactionDb } from "./client";
import { EMAIL_THROTTLE_MS } from "../accounts/rules";
import { hashToken } from "./rooms";

export type CreatePendingAccountResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "username_taken" | "email_taken" }
  | { ok: false; reason: "email_verified"; userId: string };

// Creates an account that is not verified yet, together with its verification link token. It does not send
// or count an email: the caller takes the email slot (claimEmailSlot) before sending.
//
// Two queries in one transaction:
//   1. In one query: delete an unverified account with this email, if there is one, then insert the account
//      and its token. Signing up again replaces a pending account (new username, password and link), so nobody
//      can block an address by registering it first. Its old links go with it (ON DELETE CASCADE), but the
//      time of its last email is carried over, so signing up again does not get around the one-email-per-minute
//      limit. A taken username (any case) or email inserts nothing instead of raising an error (ON CONFLICT DO
//      NOTHING). The unique indexes decide, so of two sign-ups at the same moment exactly one wins.
//   2. Read whether the username is taken or the email belongs to a verified account, to say why nothing was
//      inserted. "email_taken" alone means another sign-up with this email won at the same moment.
export async function createPendingAccount(
  db: TransactionDb,
  account: {
    email: string;
    username: string;
    passwordHash: string;
    verifyToken: string;
    verifyExpiresAt: Date;
    now: Date;
  },
): Promise<CreatePendingAccountResult> {
  const now = account.now.toISOString();
  const [inserted, check] = await db.transaction([
    {
      text: `WITH replaced AS (
               DELETE FROM users WHERE email = $1 AND email_verified_at IS NULL
               RETURNING last_email_sent_at
             ),
             new_user AS (
               INSERT INTO users (email, username, password_hash, last_email_sent_at, created_at)
               VALUES ($1, $2, $3, (SELECT max(last_email_sent_at) FROM replaced), $4)
               ON CONFLICT DO NOTHING
               RETURNING id
             )
             INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
             SELECT $5, id, 'verify', $6 FROM new_user
             RETURNING user_id`,
      params: [
        account.email,
        account.username,
        account.passwordHash,
        now,
        hashToken(account.verifyToken),
        account.verifyExpiresAt.toISOString(),
      ],
    },
    {
      text: `SELECT EXISTS (SELECT 1 FROM users WHERE lower(username) = lower($1)) AS username_taken,
                    (SELECT id FROM users WHERE email = $2 AND email_verified_at IS NOT NULL) AS verified_user_id`,
      params: [account.username, account.email],
    },
  ]);

  if (inserted.length === 1) return { ok: true, userId: (inserted[0] as { user_id: string }).user_id };
  const why = check[0] as { username_taken: boolean; verified_user_id: string | null };
  if (why.username_taken) return { ok: false, reason: "username_taken" };
  if (why.verified_user_id) return { ok: false, reason: "email_verified", userId: why.verified_user_id };
  return { ok: false, reason: "email_taken" };
}

export type RedeemVerifyTokenResult = { ok: true } | { ok: false; reason: "unknown" | "used" | "expired" };

// Opens a verification link: marks the token used and the account verified, if the token is known, not used
// yet and not expired. Two queries in one transaction:
//   1. Use the token and verify its account in one query. The WHERE clause decides, so of two clicks at the
//      same moment exactly one uses the token.
//   2. Read the token, to say why nothing happened (unknown, used or expired).
export async function redeemVerifyToken(db: TransactionDb, token: string, now: Date): Promise<RedeemVerifyTokenResult> {
  const tokenHash = hashToken(token);
  const [used, found] = await db.transaction([
    {
      text: `WITH used AS (
               UPDATE email_tokens SET used_at = $2
               WHERE token_hash = $1 AND purpose = 'verify' AND used_at IS NULL AND expires_at > $2
               RETURNING user_id
             )
             UPDATE users SET email_verified_at = COALESCE(email_verified_at, $2)
             FROM used WHERE users.id = used.user_id
             RETURNING users.id`,
      params: [tokenHash, now.toISOString()],
    },
    {
      text: "SELECT used_at FROM email_tokens WHERE token_hash = $1 AND purpose = 'verify'",
      params: [tokenHash],
    },
  ]);

  if (used.length === 1) return { ok: true };
  if (found.length === 0) return { ok: false, reason: "unknown" };
  return { ok: false, reason: found[0].used_at === null ? "expired" : "used" };
}

export type LoginAccount = { id: string; username: string; passwordHash: string; verified: boolean };

// Finds the account to log in to: by email (stored lowercase, so pass it lowercase) or by username (any case).
export async function findAccountForLogin(
  db: TransactionDb,
  by: "email" | "username",
  value: string,
): Promise<LoginAccount | null> {
  const where = by === "email" ? "email = $1" : "lower(username) = lower($1)";
  const rows = await db.query<{ id: string; username: string; password_hash: string; verified: boolean }>(
    `SELECT id, username, password_hash, email_verified_at IS NOT NULL AS verified FROM users WHERE ${where}`,
    [value],
  );
  if (rows.length === 0) return null;
  const [row] = rows;
  return { id: row.id, username: row.username, passwordHash: row.password_hash, verified: row.verified };
}

// Starts a session for an account. Only the SHA-256 hash of the token is stored.
export async function createSession(
  db: TransactionDb,
  session: { token: string; userId: string; now: Date; expiresAt: Date },
): Promise<void> {
  await db.query("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)", [
    hashToken(session.token),
    session.userId,
    session.now.toISOString(),
    session.expiresAt.toISOString(),
  ]);
}

// Who is logged in with this session token: the username, or null for an unknown or expired session.
export async function findSessionUsername(db: TransactionDb, token: string, now: Date): Promise<string | null> {
  const rows = await db.query<{ username: string }>(
    `SELECT users.username FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > $2`,
    [hashToken(token), now.toISOString()],
  );
  return rows.length === 1 ? rows[0].username : null;
}

// Ends one session (log out). Nothing happens if it does not exist.
export async function deleteSession(db: TransactionDb, token: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

// Takes the account's email slot: at most one email per account every EMAIL_THROTTLE_MS (60 s). One query sets
// last_email_sent_at to now only when it is empty or at least 60 s old, so of two requests at the same moment
// exactly one gets the slot. True when the slot was taken (send the email), false when it is too soon.
export async function claimEmailSlot(db: TransactionDb, userId: string, now: Date): Promise<boolean> {
  const rows = await db.query(
    `UPDATE users SET last_email_sent_at = $2
     WHERE id = $1 AND (last_email_sent_at IS NULL OR last_email_sent_at <= $3)
     RETURNING id`,
    [userId, now.toISOString(), new Date(now.getTime() - EMAIL_THROTTLE_MS).toISOString()],
  );
  return rows.length === 1;
}

// Finds the account with this email (stored lowercase, so pass it lowercase) if it is not verified yet.
export async function findUnverifiedUserId(db: TransactionDb, email: string): Promise<string | null> {
  const rows = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1 AND email_verified_at IS NULL", [
    email,
  ]);
  return rows.length === 1 ? rows[0].id : null;
}

// Stores a new verification link token for an account. Only its SHA-256 hash is stored.
export async function createVerifyToken(
  db: TransactionDb,
  link: { userId: string; token: string; expiresAt: Date },
): Promise<void> {
  await db.query("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, 'verify', $3)", [
    hashToken(link.token),
    link.userId,
    link.expiresAt.toISOString(),
  ]);
}

// Saves a password reset link token for an account. Only the SHA-256 hash is stored, with purpose "reset".
export async function createResetToken(
  db: TransactionDb,
  reset: { userId: string; token: string; expiresAt: Date },
): Promise<void> {
  await db.query("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, 'reset', $3)", [
    hashToken(reset.token),
    reset.userId,
    reset.expiresAt.toISOString(),
  ]);
}

export type RedeemResetTokenResult = { ok: true } | { ok: false; reason: "unknown" | "used" | "expired" };

// Opens a reset link with a new password hash. Two queries in one transaction:
//   1. In one query: use the token, replace the password hash, mark the email verified (clicking the link
//      proves the person reads that inbox) and end every session of the account (log out everywhere). The
//      WHERE clause on the token decides, so of two clicks at the same moment exactly one changes anything.
//   2. Read the token, to say why nothing happened (unknown, used or expired).
export async function redeemResetToken(
  db: TransactionDb,
  reset: { token: string; passwordHash: string; now: Date },
): Promise<RedeemResetTokenResult> {
  const tokenHash = hashToken(reset.token);
  const [changed, found] = await db.transaction([
    {
      text: `WITH used AS (
               UPDATE email_tokens SET used_at = $2
               WHERE token_hash = $1 AND purpose = 'reset' AND used_at IS NULL AND expires_at > $2
               RETURNING user_id
             ),
             ended AS (
               DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM used)
             )
             UPDATE users SET password_hash = $3, email_verified_at = COALESCE(email_verified_at, $2)
             FROM used WHERE users.id = used.user_id
             RETURNING users.id`,
      params: [tokenHash, reset.now.toISOString(), reset.passwordHash],
    },
    {
      text: "SELECT used_at FROM email_tokens WHERE token_hash = $1 AND purpose = 'reset'",
      params: [tokenHash],
    },
  ]);

  if (changed.length === 1) return { ok: true };
  if (found.length === 0) return { ok: false, reason: "unknown" };
  return { ok: false, reason: found[0].used_at === null ? "expired" : "used" };
}
