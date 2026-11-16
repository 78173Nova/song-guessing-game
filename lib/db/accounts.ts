// Saving and loading accounts and their email-link tokens. All SQL for accounts lives here.
// Tokens come in as the raw value and are hashed here (SHA-256, like room tokens in decision 012), so a raw
// token can never reach the database. Password hashes are made in lib/accounts before they get here.
import type { TransactionDb } from "./client";
import { hashToken } from "./rooms";

export type CreatePendingAccountResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "username_taken" | "email_taken" };

// Creates an account that is not verified yet, together with its verification link token.
//
// Three queries in one transaction:
//   1. Delete an unverified account with this email, if there is one: signing up again replaces it
//      (new username, password and link), so nobody can block an address by registering it first.
//      Its old links go with it (ON DELETE CASCADE).
//   2. Insert the account and its token in one query. A taken username (any case) or email inserts nothing
//      instead of raising an error (ON CONFLICT DO NOTHING). The unique indexes decide, so of two sign-ups
//      at the same moment exactly one wins.
//   3. Read whether the username is taken, to say why nothing was inserted.
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
      text: "SELECT EXISTS (SELECT 1 FROM users WHERE lower(username) = lower($1)) AS username_taken",
      params: [account.username],
    },
  ]);

  if (inserted.length === 1) return { ok: true, userId: (inserted[0] as { user_id: string }).user_id };
  if ((check[0] as { username_taken: boolean }).username_taken) return { ok: false, reason: "username_taken" };
  return { ok: false, reason: "email_taken" };
}
