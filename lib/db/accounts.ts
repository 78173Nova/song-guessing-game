// Saving and loading accounts and their email-link tokens. All SQL for accounts lives here.
// Tokens come in as the raw value and are hashed here (SHA-256, like room tokens in decision 012), so a raw
// token can never reach the database. Password hashes are made in lib/accounts before they get here.
import type { TransactionDb } from "./client";
import { hashToken } from "./rooms";

export type CreatePendingAccountResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "username_taken" | "email_verified" | "email_taken" };

// Creates an account that is not verified yet, together with its verification link token.
//
// Three queries in one transaction:
//   1. Delete an unverified account with this email, if there is one: signing up again replaces it
//      (new username, password and link), so nobody can block an address by registering it first.
//      Its old links go with it (ON DELETE CASCADE).
//   2. Insert the account and its token in one query. A taken username (any case) or email inserts nothing
//      instead of raising an error (ON CONFLICT DO NOTHING). The unique indexes decide, so of two sign-ups
//      at the same moment exactly one wins.
//   3. Read whether the username is taken or the email belongs to a verified account, to say why nothing was
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
  const [, inserted, check] = await db.transaction([
    { text: "DELETE FROM users WHERE email = $1 AND email_verified_at IS NULL", params: [account.email] },
    {
      text: `WITH new_user AS (
               INSERT INTO users (email, username, password_hash, last_email_sent_at, created_at)
               VALUES ($1, $2, $3, $4, $4)
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
