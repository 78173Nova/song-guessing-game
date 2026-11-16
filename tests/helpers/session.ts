import type { TransactionDb } from "@/lib/db/client";
import { createSession, upsertVerifiedAccount } from "@/lib/db/accounts";

// A verified account with a session that lasts one day from `now`. Returns the session token – the value the
// browser's session cookie would hold. The password hash is a placeholder: these tests never log in with it.
export async function loggedInSession(db: TransactionDb, now: Date, username = "anna_test"): Promise<string> {
  const account = await upsertVerifiedAccount(db, {
    email: `${username}@example.com`.toLowerCase(),
    username,
    passwordHash: "scrypt$test$test",
    now,
  });
  if (!account.ok) throw new Error("Test setup: the account was not created");
  const [{ id }] = await db.query<{ id: string }>("SELECT id FROM users WHERE lower(username) = lower($1)", [username]);
  const token = `session-of-${username}-${"s".repeat(32)}`;
  await createSession(db, { token, userId: id, now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
  return token;
}
