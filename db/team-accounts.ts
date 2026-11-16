// `npm run db:team-accounts`: creates the team accounts from TEAM_ACCOUNTS, already verified (decision 014).
// TEAM_ACCOUNTS = "email|username|password;email|username|password;…", only in .env.local or the host's settings,
// never in the repository. Safe to run again: an existing account gets the configured password back and stays
// verified. Never prints a password or the connection string.
import { hashPassword, parseTeamAccounts } from "../lib/accounts/rules.ts";
import { upsertVerifiedAccount } from "../lib/db/accounts.ts";
import { getDb } from "../lib/db/client.ts";
import { applySchema } from "../lib/db/schema.ts";

async function main() {
  const parsed = parseTeamAccounts(process.env.TEAM_ACCOUNTS);
  if (!parsed.ok) {
    console.error(`Team accounts not created: ${parsed.error}.`);
    process.exit(1);
  }

  const db = getDb();
  await applySchema(db);

  let failed = 0;
  for (const account of parsed.accounts) {
    const result = await upsertVerifiedAccount(db, {
      email: account.email,
      username: account.username,
      passwordHash: await hashPassword(account.password),
      now: new Date(),
    });
    if (result.ok) {
      console.log(`${account.username}: ${result.outcome}`);
    } else {
      failed++;
      console.log(`${account.username}: not created, another account already uses this username`);
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  // Only the message – never print the connection string.
  console.error("Team accounts failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
