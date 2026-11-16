import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/accounts/rules";
import { logIn, signUp } from "@/lib/api/accounts";
import { upsertVerifiedAccount } from "@/lib/db/accounts";
import type { TransactionDb } from "@/lib/db/client";
import { createTestDb } from "../helpers/test-db";

// Team accounts (decision 014): created ahead of time, already verified, by `npm run db:team-accounts`.
// Checked through the login route, so the tests show what matters: the team can log in.
let db: TransactionDb;
const now = new Date("2026-11-16T12:00:00.000Z");
const deps = { now: () => now, sendEmail: async () => ({ ok: true as const }) };

beforeEach(async () => {
  db = await createTestDb();
});

const login = (login: string, password: string) => logIn(db, JSON.stringify({ login, password }), deps);

const upsert = async (email: string, username: string, password: string) =>
  upsertVerifiedAccount(db, { email, username, passwordHash: await hashPassword(password), now });

describe("Creating a team account", () => {
  it("creates an account that can log in right away, without a verification email", async () => {
    expect(await upsert("anna@example.com", "Anna_99", "correct horse")).toEqual({ ok: true, outcome: "created" });

    expect(await login("Anna_99", "correct horse")).toMatchObject({ status: 200, body: { username: "Anna_99" } });
    expect(await login("anna@example.com", "correct horse")).toMatchObject({ status: 200 });
  });
});

describe("Running it again", () => {
  it("sets the configured password, so the new one works and the old one does not", async () => {
    await upsert("anna@example.com", "Anna_99", "correct horse");

    expect(await upsert("anna@example.com", "Anna_99", "battery staple")).toEqual({ ok: true, outcome: "updated" });

    expect(await login("Anna_99", "battery staple")).toMatchObject({ status: 200 });
    expect(await login("Anna_99", "correct horse")).toMatchObject({ status: 401 });
  });

  it("keeps the username of an existing account with that email", async () => {
    await upsert("anna@example.com", "Anna_99", "correct horse");

    await upsert("anna@example.com", "Annabelle", "correct horse");

    expect(await login("anna@example.com", "correct horse")).toMatchObject({ status: 200, body: { username: "Anna_99" } });
  });

  it("verifies an unverified sign-up with that email and gives it the configured password", async () => {
    await signUp(db, JSON.stringify({ email: "anna@example.com", username: "Anna_99", password: "signed up myself" }), deps);
    expect(await login("Anna_99", "signed up myself")).toMatchObject({ status: 403 });

    expect(await upsert("anna@example.com", "Anna_99", "correct horse")).toEqual({ ok: true, outcome: "updated" });

    expect(await login("Anna_99", "correct horse")).toMatchObject({ status: 200 });
  });
});

describe("A username that belongs to someone else", () => {
  it("changes nothing and says the username is taken, in any case", async () => {
    await upsert("bob@example.com", "Anna_99", "battery staple");

    expect(await upsert("anna@example.com", "anna_99", "correct horse")).toEqual({ ok: false, reason: "username_taken" });

    expect(await login("anna@example.com", "correct horse")).toMatchObject({ status: 401 });
    expect(await login("Anna_99", "battery staple")).toMatchObject({ status: 200 });
  });
});
