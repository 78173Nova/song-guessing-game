import { beforeEach, describe, expect, it } from "vitest";
import { logIn, resendVerification, signUp, verifyEmail } from "@/lib/api/accounts";
import { hashPassword } from "@/lib/accounts/rules";
import { createPendingAccount, upsertVerifiedAccount } from "@/lib/db/accounts";
import type { TransactionDb } from "@/lib/db/client";
import type { Email } from "@/lib/email/sender";
import { createTestDb } from "../helpers/test-db";

// Sign-up with an @novasbe.pt email is refused: the school's mail servers bounce our verification emails
// (decision 014, update 23 Nov 2026). Accounts with such an email that already exist keep working.
// Against PGlite, with a fake clock and a fake email sender. No network.
let db: TransactionDb;
let clock: Date;
let sent: Email[];
let tokenCount: number;

const deps = {
  now: () => clock,
  sendEmail: async (email: Email) => {
    sent.push(email);
    return { ok: true as const };
  },
  makeToken: () => `token-${++tokenCount}-${"a".repeat(40)}`,
};

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-23T12:00:00.000Z");
  sent = [];
  tokenCount = 0;
});

const json = (body: unknown) => JSON.stringify(body);
const signup = (body: unknown) => signUp(db, json(body), deps);

const PASSWORD = "correct-horse";
const CHECK_INBOX = { status: 200, body: { message: "Check your inbox to finish signing up" } };
const BLOCKED = {
  status: 400,
  body: { error: "email-domain-blocked", message: "You are currently not able to sign-up with an @novasbe.pt email" },
};

const users = () => db.query("SELECT email FROM users ORDER BY email");

// An @novasbe.pt account that signed up and verified before the rule.
async function verifiedAccount() {
  await upsertVerifiedAccount(db, {
    email: "anna@novasbe.pt",
    username: "Anna_99",
    passwordHash: await hashPassword(PASSWORD),
    now: clock,
  });
}

describe("POST /api/accounts/signup – @novasbe.pt emails are refused", () => {
  it("refuses an @novasbe.pt email with the note, stores nothing and sends nothing", async () => {
    const result = await signup({ email: "anna@novasbe.pt", username: "Anna_99", password: PASSWORD });

    expect(result).toEqual(BLOCKED);
    expect(await users()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("refuses the domain in any letter case", async () => {
    const result = await signup({ email: "Anna@NovaSBE.PT", username: "Anna_99", password: PASSWORD });

    expect(result).toEqual(BLOCKED);
    expect(await users()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("refuses an email that already has a verified account, and sends no 'you already have an account' email", async () => {
    await verifiedAccount();

    const result = await signup({ email: "anna@novasbe.pt", username: "Other_1", password: PASSWORD });

    expect(result).toEqual(BLOCKED);
    expect(await users()).toEqual([{ email: "anna@novasbe.pt" }]);
    expect(sent).toEqual([]);
  });

  it("still gives the normal invalid-email error for an address with nothing before the @", async () => {
    const result = await signup({ email: "@novasbe.pt", username: "Anna_99", password: PASSWORD });

    expect(result).toEqual({ status: 400, body: { error: "invalid-email", message: expect.any(String) } });
  });
});

describe("POST /api/accounts/signup – only the exact domain is refused", () => {
  it.each([["anna@notnovasbe.pt"], ["anna@novasbe.pt.example.com"], ["anna@campus.novasbe.pt"]])("accepts %s", async (email) => {
    const result = await signup({ email, username: "Anna_99", password: PASSWORD });

    expect(result).toEqual(CHECK_INBOX);
    expect(await users()).toEqual([{ email }]);
    expect(sent.map((e) => e.to)).toEqual([email]);
  });
});

describe("Accounts with an @novasbe.pt email that already exist keep working", () => {
  const MINUTE = 60 * 1000;
  const pendingToken = `pending-${"b".repeat(40)}`;

  // An account that signed up before the rule and has not opened its link yet.
  async function pendingAccount() {
    await createPendingAccount(db, {
      email: "anna@novasbe.pt",
      username: "Anna_99",
      passwordHash: await hashPassword(PASSWORD),
      verifyToken: pendingToken,
      verifyExpiresAt: new Date(clock.getTime() + 24 * 60 * MINUTE),
      now: clock,
    });
  }

  it("a verified account can still log in", async () => {
    await verifiedAccount();

    const result = await logIn(db, json({ login: "anna@novasbe.pt", password: PASSWORD }), deps);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ username: "Anna_99" });
  });

  it("a pending account's verification link still works", async () => {
    await pendingAccount();

    const result = await verifyEmail(db, json({ token: pendingToken }), deps);

    expect(result).toEqual({ status: 200, body: { message: "Your email is verified – you can log in now" } });
  });

  it("a pending account can still ask for the verification email again", async () => {
    await pendingAccount();
    clock = new Date(clock.getTime() + MINUTE);

    const result = await resendVerification(db, json({ email: "anna@novasbe.pt" }), deps);

    expect(result.status).toBe(200);
    expect(sent.map((e) => e.to)).toEqual(["anna@novasbe.pt"]);
    expect(sent[0].text).toContain(`/verify-email?token=token-1-${"a".repeat(40)}`);
  });
});
