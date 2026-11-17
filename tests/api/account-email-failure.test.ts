import { beforeEach, describe, expect, it } from "vitest";
import { changeEmail, forgotPassword, logIn, resendVerification, signUp, verifyEmail } from "@/lib/api/accounts";
import type { TransactionDb } from "@/lib/db/client";
import type { Email } from "@/lib/email/sender";
import { createTestDb } from "../helpers/test-db";

// When the email service is down or slow (issue #25), each action that sends an email replies with a clear
// "couldn't send" message instead of crashing or pretending the email is on its way. Against PGlite, with a
// fake clock and a fake email sender that can be switched to fail.
let db: TransactionDb;
let clock: Date;
let sent: Email[];
let failing: boolean;
let tokenCount: number;

const deps = {
  now: () => clock,
  sendEmail: async (email: Email) => {
    if (failing) return { ok: false as const };
    sent.push(email);
    return { ok: true as const };
  },
  makeToken: () => `token-${++tokenCount}-${"a".repeat(40)}`,
};

const MINUTE = 60 * 1000;
const later = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};
const json = (body: unknown) => JSON.stringify(body);

const EMAIL_FAILED = {
  status: 503,
  body: { error: "email-failed", message: "We couldn't send the email right now. Please try again in a minute." },
};

const anna = { email: "anna@example.com", username: "Anna_99", password: "anna-secret-1" };

// A verified account, made while the email service works.
async function verifiedAnna() {
  await signUp(db, json(anna), deps);
  const token = decodeURIComponent(sent.at(-1)!.text.match(/token=([^\s]+)/)![1]);
  await verifyEmail(db, json({ token }), deps);
  later(2 * MINUTE);
  sent = [];
}

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-17T12:00:00.000Z");
  sent = [];
  failing = false;
  tokenCount = 0;
});

describe("Email service down – sign-up", () => {
  it("replies 'couldn't send' for a new sign-up", async () => {
    failing = true;
    expect(await signUp(db, json(anna), deps)).toEqual(EMAIL_FAILED);
  });

  it("replies 'couldn't send' for the email of a verified account too, so the reply reveals nothing", async () => {
    await verifiedAnna();
    failing = true;
    expect(await signUp(db, json({ ...anna, username: "Someone_Else" }), deps)).toEqual(EMAIL_FAILED);
  });

  it("works again a minute later once the email service is back", async () => {
    failing = true;
    await signUp(db, json(anna), deps);
    failing = false;
    later(MINUTE);

    expect(await resendVerification(db, json({ email: anna.email }), deps)).toEqual({
      status: 200,
      body: { message: expect.any(String) },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("anna@example.com");
  });
});

describe("Email service down – send the email again and forgot password", () => {
  it("replies 'couldn't send' to Send the email again for an unverified account", async () => {
    await signUp(db, json(anna), deps);
    later(MINUTE);
    failing = true;
    expect(await resendVerification(db, json({ email: anna.email }), deps)).toEqual(EMAIL_FAILED);
  });

  it("replies 'couldn't send' to Forgot password for a known email", async () => {
    await verifiedAnna();
    failing = true;
    expect(await forgotPassword(db, json({ email: anna.email }), deps)).toEqual(EMAIL_FAILED);
  });

  it("gives an unknown email the normal reply, because no email is sent", async () => {
    failing = true;
    expect(await forgotPassword(db, json({ email: "nobody@example.com" }), deps)).toEqual({
      status: 200,
      body: { message: expect.any(String) },
    });
  });
});

describe("Email service down – change email", () => {
  it("replies 'couldn't send' and leaves the email unchanged", async () => {
    await verifiedAnna();
    const login = await logIn(db, json({ login: anna.username, password: anna.password }), deps);
    const session = login.setCookie!.split(";")[0].split("=")[1];
    failing = true;

    expect(await changeEmail(db, session, json({ email: "new@example.com", password: anna.password }), deps)).toEqual(
      EMAIL_FAILED,
    );
    expect(await db.query("SELECT email FROM users")).toEqual([{ email: "anna@example.com" }]);
  });
});
