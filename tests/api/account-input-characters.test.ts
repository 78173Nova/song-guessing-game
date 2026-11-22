import { beforeEach, describe, expect, it } from "vitest";
import {
  changeEmail,
  forgotPassword,
  logIn,
  resendVerification,
  signUp,
  verifyEmail,
} from "@/lib/api/accounts";
import type { TransactionDb } from "@/lib/db/client";
import type { Email } from "@/lib/email/sender";
import { createTestDb } from "../helpers/test-db";

// Emails and logins with characters the database cannot store (security audit, 22 Nov): every account form refuses
// them with a clear 400 instead of a server error. Against PGlite, which refuses the same values as Neon.
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

const MINUTE = 60 * 1000;
const json = (body: unknown) => JSON.stringify(body);

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-22T12:00:00.000Z");
  sent = [];
  tokenCount = 0;
});

// A verified account that is logged in; returns its session cookie value.
async function verifiedAccount(): Promise<string> {
  await signUp(db, json({ email: "anna@example.com", username: "Anna_99", password: "correct-horse" }), deps);
  const token = decodeURIComponent(sent.at(-1)!.text.match(/token=([^\s]+)/)![1]);
  await verifyEmail(db, json({ token }), deps);
  const login = await logIn(db, json({ login: "Anna_99", password: "correct-horse" }), deps);
  sent = [];
  clock = new Date(clock.getTime() + 2 * MINUTE);
  return login.setCookie!.split(";")[0].split("=")[1];
}

const INVALID_EMAIL = { status: 400, body: { error: "invalid-email", message: expect.any(String) } };

// A NUL (invisible "character 0") and another control character, inside and at the end.
const CONTROL_EMAILS = [
  ["a NUL", "an\u0000na@example.com"],
  ["a NUL at the end", "anna@example.com\u0000"],
  ["a bell character", "an\u0007na@example.com"],
];

// "İ" (capital I with a dot) becomes two characters when lowercased: 252 characters before, 492 after.
const GROWS_TOO_LONG = `${"İ".repeat(240)}@example.com`;

describe("Account forms refuse characters the database cannot store", () => {
  it.each(CONTROL_EMAILS)("sign-up refuses an email with %s, creates nothing and sends nothing", async (_label, email) => {
    expect(await signUp(db, json({ email, username: "Anna_99", password: "correct-horse" }), deps)).toEqual(INVALID_EMAIL);
    expect(await db.query("SELECT id FROM users")).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("sign-up refuses an email that is too long once lowercased", async () => {
    expect(GROWS_TOO_LONG.length).toBeLessThanOrEqual(254);
    expect(await signUp(db, json({ email: GROWS_TOO_LONG, username: "Anna_99", password: "correct-horse" }), deps)).toEqual(
      INVALID_EMAIL,
    );
    expect(await db.query("SELECT id FROM users")).toEqual([]);
  });

  it("sign-up still accepts letters with accents in an email", async () => {
    const result = await signUp(db, json({ email: "Zoë@Example.com", username: "Zoe_1", password: "correct-horse" }), deps);
    expect(result.status).toBe(200);
    expect(await db.query("SELECT email FROM users")).toEqual([{ email: "zoë@example.com" }]);
  });

  it.each([
    ["an email with a NUL", "anna@example.com\u0000"],
    ["a username with a NUL", "Anna_99\u0000"],
    ["a username with a bell character", "Anna\u0007_99"],
  ])("login refuses %s with a 400 and starts no session", async (_label, login) => {
    await verifiedAccount();
    const result = await logIn(db, json({ login, password: "correct-horse" }), deps);
    expect(result.status).toBe(400);
    expect(result.setCookie).toBeUndefined();
  });

  it.each(CONTROL_EMAILS)("forgot password refuses an email with %s and sends nothing", async (_label, email) => {
    await verifiedAccount();
    expect(await forgotPassword(db, json({ email }), deps)).toEqual(INVALID_EMAIL);
    expect(sent).toEqual([]);
  });

  it.each(CONTROL_EMAILS)("'Send the email again' refuses an email with %s and sends nothing", async (_label, email) => {
    expect(await resendVerification(db, json({ email }), deps)).toEqual(INVALID_EMAIL);
    expect(sent).toEqual([]);
  });

  it.each([...CONTROL_EMAILS, ["too many characters once lowercased", GROWS_TOO_LONG]])(
    "changing the email refuses an address with %s and sends nothing",
    async (_label, email) => {
      const session = await verifiedAccount();
      expect(await changeEmail(db, session, json({ email, password: "correct-horse" }), deps)).toEqual(INVALID_EMAIL);
      expect(sent).toEqual([]);
    },
  );
});
