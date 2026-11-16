import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/accounts/rules";
import { logIn, signUp, whoIsLoggedIn } from "@/lib/api/accounts";
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
    expect(await upsert("anna@example.com", "Anna_99", "correct-horse")).toEqual({ ok: true, outcome: "created", username: "Anna_99" });

    expect(await login("Anna_99", "correct-horse")).toMatchObject({ status: 200, body: { username: "Anna_99" } });
    expect(await login("anna@example.com", "correct-horse")).toMatchObject({ status: 200 });
  });
});

describe("Running it again", () => {
  it("sets the configured password, so the new one works and the old one does not", async () => {
    await upsert("anna@example.com", "Anna_99", "correct-horse");

    expect(await upsert("anna@example.com", "Anna_99", "battery-staple")).toEqual({ ok: true, outcome: "updated", username: "Anna_99" });

    expect(await login("Anna_99", "battery-staple")).toMatchObject({ status: 200 });
    expect(await login("Anna_99", "correct-horse")).toMatchObject({ status: 401 });
  });

  it("keeps the username of an existing account with that email, and says which username that is", async () => {
    await upsert("anna@example.com", "Anna_99", "correct-horse");

    expect(await upsert("anna@example.com", "Annabelle", "correct-horse")).toEqual({
      ok: true,
      outcome: "updated",
      username: "Anna_99",
    });

    expect(await login("anna@example.com", "correct-horse")).toMatchObject({ status: 200, body: { username: "Anna_99" } });
  });

  it("keeps the account's sessions, so running it again logs nobody out", async () => {
    await upsert("anna@example.com", "Anna_99", "correct-horse");
    const loggedIn = await logIn(db, JSON.stringify({ login: "Anna_99", password: "correct-horse" }), {
      ...deps,
      makeToken: () => `session-${"a".repeat(40)}`,
    });
    expect(loggedIn.status).toBe(200);

    await upsert("anna@example.com", "Anna_99", "correct-horse");

    expect(await whoIsLoggedIn(db, `session-${"a".repeat(40)}`, deps)).toEqual({ status: 200, body: { username: "Anna_99" } });
  });

  it("verifies an unverified sign-up with that email and gives it the configured password", async () => {
    await signUp(db, JSON.stringify({ email: "anna@example.com", username: "Anna_99", password: "signed-up-myself" }), deps);
    expect(await login("Anna_99", "signed-up-myself")).toMatchObject({ status: 403 });

    expect(await upsert("anna@example.com", "Anna_99", "correct-horse")).toEqual({ ok: true, outcome: "updated", username: "Anna_99" });

    expect(await login("Anna_99", "correct-horse")).toMatchObject({ status: 200 });
  });
});

describe("A username that belongs to someone else", () => {
  it("changes nothing and says the username is taken, in any case", async () => {
    await upsert("bob@example.com", "Anna_99", "battery-staple");

    expect(await upsert("anna@example.com", "anna_99", "correct-horse")).toEqual({ ok: false, reason: "username_taken" });

    expect(await login("anna@example.com", "correct-horse")).toMatchObject({ status: 401 });
    expect(await login("Anna_99", "battery-staple")).toMatchObject({ status: 200 });
  });

  it("takes the username of someone else's sign-up whose verification link expired unused", async () => {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000 - 1);
    await signUp(db, JSON.stringify({ email: "bob@example.com", username: "Anna_99", password: "battery-staple" }), {
      ...deps,
      now: () => dayAgo,
    });

    expect(await upsert("anna@example.com", "Anna_99", "correct-horse")).toEqual({
      ok: true,
      outcome: "created",
      username: "Anna_99",
    });
    expect(await login("Anna_99", "correct-horse")).toMatchObject({ status: 200 });
  });

  it("does not take the username of someone else's sign-up whose link still works", async () => {
    await signUp(db, JSON.stringify({ email: "bob@example.com", username: "Anna_99", password: "battery-staple" }), deps);

    expect(await upsert("anna@example.com", "Anna_99", "correct-horse")).toEqual({ ok: false, reason: "username_taken" });
  });
});
