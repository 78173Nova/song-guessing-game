// Saving and loading accounts and their email-link tokens. All SQL for accounts lives here.
// Tokens come in as the raw value and are hashed here (SHA-256, like room tokens in decision 012), so a raw
// token can never reach the database. Password hashes are made in lib/accounts before they get here.
import type { TransactionDb } from "./client";
import { EMAIL_THROTTLE_MS } from "../accounts/rules";
import { hashToken } from "./rooms";

export type CreatePendingAccountResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "username_taken" | "email_taken" | "email_verified" };

// Creates an account that is not verified yet, together with its verification link token. It does not send
// or count an email: the caller takes the email slot (claimEmailSlot) before sending.
//
// Two queries in one transaction:
//   1. In one query: if the address got no email in the last minute, delete an unverified account with this
//      email, if there is one, then insert the account and its token. Signing up again replaces a pending
//      account (new username, password and link), so nobody can block an address by registering it first. Its
//      old links go with it (ON DELETE CASCADE). Within a minute of the last email nothing changes, so the old
//      account and its link stay valid (no new link could be sent anyway). A taken username (any case) or
//      email inserts nothing instead of raising an error (ON CONFLICT DO NOTHING). The unique indexes decide,
//      so of two sign-ups at the same moment exactly one wins.
//   2. Read whether the username is taken or the email belongs to a verified account, to say why nothing was
//      inserted. The pending account with this email does not count as taking its own username. "email_taken"
//      alone means the address got an email in the last minute, or another sign-up with this email won at the
//      same moment.
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
  const [inserted, check] = await db.transaction([
    {
      text: `WITH slot_free AS (
               SELECT NOT EXISTS (
                 SELECT 1 FROM email_throttle WHERE email_hash = $7 AND last_sent_at > $8
               ) AS free
             ),
             replaced AS (
               DELETE FROM users WHERE email = $1 AND email_verified_at IS NULL AND (SELECT free FROM slot_free)
               RETURNING id
             ),
             new_user AS (
               INSERT INTO users (email, username, password_hash, created_at)
               -- Reading "replaced" makes the delete happen before this insert, so the email is free again.
               SELECT $1, $2, $3, $4 WHERE (SELECT free FROM slot_free) AND (SELECT count(*) FROM replaced) >= 0
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
        account.now.toISOString(),
        hashToken(account.verifyToken),
        account.verifyExpiresAt.toISOString(),
        hashEmail(account.email),
        throttleCutoff(account.now),
      ],
    },
    {
      text: `SELECT EXISTS (
                      SELECT 1 FROM users WHERE lower(username) = lower($1)
                      AND NOT (email = $2 AND email_verified_at IS NULL)
                    ) AS username_taken,
                    EXISTS (SELECT 1 FROM users WHERE email = $2 AND email_verified_at IS NOT NULL) AS email_verified`,
      params: [account.username, account.email],
    },
  ]);

  if (inserted.length === 1) return { ok: true, userId: (inserted[0] as { user_id: string }).user_id };
  const why = check[0] as { username_taken: boolean; email_verified: boolean };
  if (why.username_taken) return { ok: false, reason: "username_taken" };
  if (why.email_verified) return { ok: false, reason: "email_verified" };
  return { ok: false, reason: "email_taken" };
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

// The one-email-per-minute limit is kept per address, whether or not it has an account, so a "please wait"
// reply never shows whether an account exists. Only the SHA-256 hash of the lowercase address is stored
// (table email_throttle), so the table holds no plain address of someone who has no account.
function hashEmail(email: string): string {
  return hashToken(email.toLowerCase());
}

// An address may get its next email once its last one is at least EMAIL_THROTTLE_MS (60 s) old.
function throttleCutoff(now: Date): string {
  return new Date(now.getTime() - EMAIL_THROTTLE_MS).toISOString();
}

// Takes the email slot of an address: at most one email per address every 60 s. Every email goes through here
// (sign-up, "you already have an account", "Send the email again", forgot password). One query saves now as the
// time of the address's last email, only when it has none yet or it is at least 60 s old, so of two requests at
// the same moment exactly one gets the slot. True when the slot was taken (send the email), false when it is
// too soon.
export async function claimEmailSlot(db: TransactionDb, email: string, now: Date): Promise<boolean> {
  const rows = await db.query(
    `INSERT INTO email_throttle (email_hash, last_sent_at) VALUES ($1, $2)
     ON CONFLICT (email_hash) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at
     WHERE email_throttle.last_sent_at <= $3
     RETURNING email_hash`,
    [hashEmail(email), now.toISOString(), throttleCutoff(now)],
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

// What an email link is for: verify the email (24 hours) or reset the password (1 hour).
export type EmailTokenPurpose = "verify" | "reset";

// Stores a new email link token for an account. Only its SHA-256 hash is stored.
export async function createEmailToken(
  db: TransactionDb,
  link: { userId: string; token: string; purpose: EmailTokenPurpose; expiresAt: Date },
): Promise<void> {
  await db.query("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4)", [
    hashToken(link.token),
    link.userId,
    link.purpose,
    link.expiresAt.toISOString(),
  ]);
}

export type RedeemEmailTokenResult = { ok: true } | { ok: false; reason: "unknown" | "used" | "expired" };

// What opening a link does, in one query each. Both use the token only if it has this purpose, is not used yet
// and not expired; then:
// - verify: marks the account verified.
// - reset: replaces the password hash ($3), marks the email verified (clicking the link proves the person reads
//   that inbox) and ends every session of the account (log out everywhere).
const REDEEM_QUERIES: Record<EmailTokenPurpose, string> = {
  verify: `WITH used AS (
             UPDATE email_tokens SET used_at = $2
             WHERE token_hash = $1 AND purpose = 'verify' AND used_at IS NULL AND expires_at > $2
             RETURNING user_id
           )
           UPDATE users SET email_verified_at = COALESCE(email_verified_at, $2)
           FROM used WHERE users.id = used.user_id
           RETURNING users.id`,
  reset: `WITH used AS (
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
};

// Opens an email link; a reset link comes with the new password hash. Two queries in one transaction:
//   1. Use the token and do what the link is for (REDEEM_QUERIES). The WHERE clause on the token decides, so
//      of two clicks at the same moment exactly one changes anything.
//   2. Read the token, to say why nothing happened (unknown, used or expired). A link with the other purpose
//      counts as unknown.
export async function redeemEmailToken(
  db: TransactionDb,
  link: { token: string; now: Date } & ({ purpose: "verify" } | { purpose: "reset"; passwordHash: string }),
): Promise<RedeemEmailTokenResult> {
  const tokenHash = hashToken(link.token);
  const params = [tokenHash, link.now.toISOString()];
  if (link.purpose === "reset") params.push(link.passwordHash);
  const [changed, found] = await db.transaction([
    { text: REDEEM_QUERIES[link.purpose], params },
    {
      text: "SELECT used_at FROM email_tokens WHERE token_hash = $1 AND purpose = $2",
      params: [tokenHash, link.purpose],
    },
  ]);

  if (changed.length === 1) return { ok: true };
  if (found.length === 0) return { ok: false, reason: "unknown" };
  return { ok: false, reason: found[0].used_at === null ? "expired" : "used" };
}
