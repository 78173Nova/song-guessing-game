import { beforeEach, describe, expect, it } from "vitest";
import {
  changeEmail,
  changePassword,
  changeUsername,
  confirmEmailChange,
  forgotPassword,
  getAccountSettings,
  logIn,
  signUp,
  verifyEmail,
  whoIsLoggedIn,
} from "@/lib/api/accounts";
import type { TransactionDb } from "@/lib/db/client";
import type { Email } from "@/lib/email/sender";
import { createTestDb } from "../helpers/test-db";

// Changing the login details on the Account settings page (issue #45): username, email and password, through the
// accounts API, against PGlite, with a fake clock, a fake email sender and predictable tokens.
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
const HOUR = 60 * MINUTE;
const later = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

const json = (body: unknown) => (typeof body === "string" ? body : JSON.stringify(body));

// A verified account that is logged in; returns the session cookie value. Sign-up, verify and log in go through
// the API like a real person; the emails of the set-up are forgotten.
async function account(email: string, username: string, password: string): Promise<string> {
  await signUp(db, json({ email, username, password }), deps);
  const link = sent.at(-1)!.text.match(/token=([^\s]+)/)![1];
  await verifyEmail(db, json({ token: decodeURIComponent(link) }), deps);
  const session = await logInAs(username, password);
  sent = [];
  later(2 * MINUTE); // the sign-up email no longer holds the email slot
  return session!;
}

// Logs in and returns the session cookie value, or null when the login is refused.
async function logInAs(login: string, password: string): Promise<string | null> {
  const result = await logIn(db, json({ login, password }), deps);
  return result.status === 200 ? result.setCookie!.split(";")[0].split("=")[1] : null;
}

const ANNA_PASSWORD = "anna-secret-1";
let anna: string;

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-17T12:00:00.000Z");
  sent = [];
  tokenCount = 0;
  anna = await account("anna@example.com", "Anna_99", ANNA_PASSWORD);
});

const LOG_IN_NEEDED = {
  status: 401,
  body: { error: "log-in-needed", message: expect.any(String) },
};

const whoIs = async (session: string) => (await whoIsLoggedIn(db, session, deps)).body.username;

describe("POST /api/accounts/username", () => {
  const rename = (session: string | undefined, body: unknown) => changeUsername(db, session, json(body), deps);

  it("changes the username as typed; the account logs in with the new one", async () => {
    expect(await rename(anna, { username: "Annika_7" })).toEqual({
      status: 200,
      body: { username: "Annika_7" },
    });

    expect(await whoIs(anna)).toBe("Annika_7");
    expect((await getAccountSettings(db, anna, deps)).body).toMatchObject({
      username: "Annika_7",
    });
    expect(await logInAs("annika_7", ANNA_PASSWORD)).not.toBeNull();
    expect(await logInAs("Anna_99", ANNA_PASSWORD)).toBeNull();
  });

  it("accepts the own username in another letter case", async () => {
    expect(await rename(anna, { username: "ANNA_99" })).toEqual({
      status: 200,
      body: { username: "ANNA_99" },
    });
    expect(await whoIs(anna)).toBe("ANNA_99");
  });

  it("refuses a username another account has in another letter case, and changes nothing", async () => {
    await account("ben@example.com", "Ben_1", "ben-secret-1");

    expect(await rename(anna, { username: "BEN_1" })).toEqual({
      status: 409,
      body: { error: "username-taken", message: "This username is taken" },
    });
    expect(await whoIs(anna)).toBe("Anna_99");
  });

  it("refuses a username held by a sign-up that is not verified yet", async () => {
    await signUp(
      db,
      json({
        email: "carl@example.com",
        username: "Carl_3",
        password: "carl-secret-1",
      }),
      deps,
    );

    expect(await rename(anna, { username: "carl_3" })).toMatchObject({
      status: 409,
      body: { error: "username-taken" },
    });
  });

  it("frees the old username straight away for someone else", async () => {
    await rename(anna, { username: "Annika_7" });

    const ben = await account("ben@example.com", "anna_99", "ben-secret-1");
    expect(await whoIs(ben)).toBe("anna_99");
    expect(await rename(anna, { username: "Anna_99" })).toMatchObject({
      status: 409,
    });
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(21)],
    ["a space", "Anna 99"],
    ["an @", "anna@x"],
    ["a letter that is not English", "Änna_99"],
    ["empty", ""],
  ])("refuses a username that is %s and changes nothing", async (_, username) => {
    expect(await rename(anna, { username })).toEqual({
      status: 400,
      body: { error: "invalid-username", message: expect.any(String) },
    });
    expect(await whoIs(anna)).toBe("Anna_99");
  });

  it("refuses a body that is not a JSON object with a text username", async () => {
    for (const body of ["not json", "[]", "null", json({ username: 7 }), json({})]) {
      expect(await rename(anna, body)).toMatchObject({
        status: 400,
        body: { error: "malformed" },
      });
    }
  });

  it("is refused without a working session", async () => {
    for (const session of [undefined, "", "x".repeat(64)]) {
      expect(await rename(session, { username: "Annika_7" })).toEqual(LOG_IN_NEEDED);
    }
    later(31 * 24 * HOUR); // the session has ended
    expect(await rename(anna, { username: "Annika_7" })).toEqual(LOG_IN_NEEDED);
  });
});

describe("POST /api/accounts/password", () => {
  const NEW_PASSWORD = "new-secret-22";
  const change = (session: string | undefined, body: unknown) => changePassword(db, session, json(body), deps);

  it("changes the password, ends every other session and keeps this browser logged in", async () => {
    const phone = (await logInAs("Anna_99", ANNA_PASSWORD))!;

    expect(
      await change(anna, {
        currentPassword: ANNA_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).toEqual({
      status: 200,
      body: { message: expect.any(String) },
    });

    expect(await whoIs(anna)).toBe("Anna_99");
    expect(await whoIs(phone)).toBeNull();
    expect(await logInAs("Anna_99", ANNA_PASSWORD)).toBeNull();
    expect(await logInAs("Anna_99", NEW_PASSWORD)).not.toBeNull();
  });

  it("refuses a wrong current password and changes nothing", async () => {
    const phone = (await logInAs("Anna_99", ANNA_PASSWORD))!;

    expect(
      await change(anna, {
        currentPassword: "not-my-password",
        newPassword: NEW_PASSWORD,
      }),
    ).toEqual({
      status: 403,
      body: {
        error: "wrong-password",
        message: "Your current password is not right.",
      },
    });
    expect(await whoIs(phone)).toBe("Anna_99");
    expect(await logInAs("Anna_99", ANNA_PASSWORD)).not.toBeNull();
  });

  it.each([
    ["7 characters", "1234567"],
    ["129 characters", "a".repeat(129)],
    ["a space", "new secret 22"],
    ["a space at the end", "new-secret-22 "],
  ])("refuses a new password with %s and changes nothing", async (_, newPassword) => {
    expect(await change(anna, { currentPassword: ANNA_PASSWORD, newPassword })).toEqual({
      status: 400,
      body: { error: "invalid-password", message: expect.any(String) },
    });
    expect(await logInAs("Anna_99", ANNA_PASSWORD)).not.toBeNull();
  });

  it("accepts new passwords of 8 and 128 characters", async () => {
    expect(
      await change(anna, {
        currentPassword: ANNA_PASSWORD,
        newPassword: "12345678",
      }),
    ).toMatchObject({
      status: 200,
    });
    expect(
      await change(anna, {
        currentPassword: "12345678",
        newPassword: "b".repeat(128),
      }),
    ).toMatchObject({
      status: 200,
    });
    expect(await logInAs("Anna_99", "b".repeat(128))).not.toBeNull();
  });

  it("refuses a body that is not a JSON object with two texts", async () => {
    for (const body of [
      "not json",
      "[]",
      json({ currentPassword: ANNA_PASSWORD }),
      json({ currentPassword: 1, newPassword: NEW_PASSWORD }),
      json({ currentPassword: "x".repeat(200), newPassword: NEW_PASSWORD }),
    ]) {
      expect(await change(anna, body)).toMatchObject({
        status: 400,
        body: { error: "malformed" },
      });
    }
  });

  it("is refused without a working session", async () => {
    for (const session of [undefined, "x".repeat(64)]) {
      expect(
        await change(session, {
          currentPassword: ANNA_PASSWORD,
          newPassword: NEW_PASSWORD,
        }),
      ).toEqual(LOG_IN_NEEDED);
    }
    expect(await logInAs("Anna_99", ANNA_PASSWORD)).not.toBeNull();
  });
});

describe("POST /api/accounts/email and the confirm link", () => {
  const move = (session: string | undefined, body: unknown) => changeEmail(db, session, json(body), deps);
  const confirm = (body: unknown) => confirmEmailChange(db, json(body), deps);
  const tokenIn = (email: Email) => decodeURIComponent(email.text.match(/token=([^\s]+)/)![1]);
  const NEW = "anna.new@example.org";

  it("sends a link to the new address and a notice to the old one; the email changes only after the link", async () => {
    expect(
      await move(anna, {
        email: " Anna.New@Example.org ",
        password: ANNA_PASSWORD,
      }),
    ).toEqual({
      status: 200,
      body: { message: expect.any(String) },
    });

    expect(sent.map((e) => e.to).sort()).toEqual(["anna.new@example.org", "anna@example.com"]);
    const link = sent.find((e) => e.to === NEW)!;
    expect(link.text).toContain("http://localhost:3000/confirm-email?token=");
    const notice = sent.find((e) => e.to === "anna@example.com")!;
    expect(notice.text).toContain(`Your email is being changed to ${NEW}`);
    expect(notice.text).toContain("If this wasn't you, reset your password");
    expect(notice.text).not.toContain("token=");

    // Not changed yet: the old email still logs in, the new one does not.
    expect(await logInAs("anna@example.com", ANNA_PASSWORD)).not.toBeNull();
    expect(await logInAs(NEW, ANNA_PASSWORD)).toBeNull();

    expect(await confirm({ token: tokenIn(link) })).toEqual({
      status: 200,
      body: { message: expect.any(String) },
    });
    expect(await logInAs(NEW, ANNA_PASSWORD)).not.toBeNull();
    expect(await logInAs("anna@example.com", ANNA_PASSWORD)).toBeNull();
    expect(await whoIs(anna)).toBe("Anna_99");
  });

  const SAME_REPLY = { status: 200, body: { message: expect.any(String) } };
  const linkTo = (address: string) => tokenIn(sent.find((e) => e.to === address)!);

  it("refuses a wrong current password: no email, nothing changes", async () => {
    expect(await move(anna, { email: NEW, password: "not-my-password" })).toEqual({
      status: 403,
      body: {
        error: "wrong-password",
        message: "Your current password is not right.",
      },
    });
    expect(sent).toEqual([]);
  });

  it("refuses a link that was already used", async () => {
    await move(anna, { email: NEW, password: ANNA_PASSWORD });
    const token = linkTo(NEW);
    await confirm({ token });

    expect(await confirm({ token })).toEqual({
      status: 400,
      body: { error: "link-used", message: expect.any(String) },
    });
  });

  it("works up to just before 24 hours and refuses the link after that; the email stays", async () => {
    await move(anna, { email: NEW, password: ANNA_PASSWORD });
    const token = linkTo(NEW);

    later(24 * HOUR);
    expect(await confirm({ token })).toEqual({
      status: 400,
      body: { error: "link-expired", message: expect.any(String) },
    });
    expect(await logInAs("anna@example.com", ANNA_PASSWORD)).not.toBeNull();
  });

  it("opens the link up to just before 24 hours", async () => {
    await move(anna, { email: NEW, password: ANNA_PASSWORD });
    later(24 * HOUR - 1);
    expect(await confirm({ token: linkTo(NEW) })).toMatchObject({
      status: 200,
    });
  });

  it("refuses unknown links and links of another kind (a verification link)", async () => {
    expect(await confirm({ token: "z".repeat(43) })).toMatchObject({
      status: 404,
      body: { error: "link-unknown" },
    });

    await signUp(
      db,
      json({
        email: "carl@example.com",
        username: "Carl_3",
        password: "carl-secret-1",
      }),
      deps,
    );
    const verifyLink = linkTo("carl@example.com");
    expect(await confirm({ token: verifyLink })).toMatchObject({
      status: 404,
      body: { error: "link-unknown" },
    });
    expect(await confirm({})).toMatchObject({
      status: 400,
      body: { error: "malformed" },
    });
    expect(await confirm("not json")).toMatchObject({
      status: 400,
      body: { error: "malformed" },
    });
  });

  it("gives the same reply when the new address already has an account, sends no link and changes nothing", async () => {
    await account("ben@example.com", "Ben_1", "ben-secret-1");

    expect(await move(anna, { email: "BEN@example.com", password: ANNA_PASSWORD })).toEqual(SAME_REPLY);

    expect(sent.map((e) => e.to).sort()).toEqual(["anna@example.com", "ben@example.com"]);
    const toBen = sent.find((e) => e.to === "ben@example.com")!;
    expect(toBen.text).not.toContain("token=");
    expect(toBen.text).toContain("already have an");
    expect(await logInAs("ben@example.com", "ben-secret-1")).not.toBeNull();
    expect(await logInAs("anna@example.com", ANNA_PASSWORD)).not.toBeNull();
  });

  it("an unverified sign-up with the new address is replaced when the link is opened", async () => {
    await signUp(db, json({ email: NEW, username: "Carl_3", password: "carl-secret-1" }), deps);
    sent = [];
    later(2 * MINUTE);

    expect(await move(anna, { email: NEW, password: ANNA_PASSWORD })).toEqual(SAME_REPLY);
    expect(await confirm({ token: linkTo(NEW) })).toMatchObject({
      status: 200,
    });
    expect(await logInAs(NEW, ANNA_PASSWORD)).not.toBeNull();
    // The abandoned sign-up is gone, so its username is free.
    expect(await changeUsername(db, anna, json({ username: "carl_3" }), deps)).toMatchObject({ status: 200 });
  });

  it("refuses the link when the new address got a verified account in the meantime; the link still works later", async () => {
    await move(anna, { email: NEW, password: ANNA_PASSWORD });
    const token = linkTo(NEW);
    later(2 * MINUTE);
    await account(NEW, "Dora_4", "dora-secret-1");

    expect(await confirm({ token })).toEqual({
      status: 409,
      body: { error: "email-taken", message: expect.any(String) },
    });
    expect(await logInAs(NEW, "dora-secret-1")).not.toBeNull();
    expect(await logInAs("anna@example.com", ANNA_PASSWORD)).not.toBeNull();
  });

  it("frees the old address once the change is confirmed", async () => {
    await move(anna, { email: NEW, password: ANNA_PASSWORD });
    await confirm({ token: linkTo(NEW) });
    later(2 * MINUTE);

    const ben = await account("anna@example.com", "Ben_1", "ben-secret-1");
    expect(await whoIs(ben)).toBe("Ben_1");
  });

  it("goes through the one-email-per-minute limit for both addresses", async () => {
    await move(anna, { email: NEW, password: ANNA_PASSWORD });
    sent = [];

    later(MINUTE - 1);
    expect(await move(anna, { email: "other@example.org", password: ANNA_PASSWORD })).toEqual({
      status: 429,
      body: { error: "too-soon", message: expect.any(String) },
    });
    expect(sent).toEqual([]);

    later(1);
    expect(await move(anna, { email: "other@example.org", password: ANNA_PASSWORD })).toEqual(SAME_REPLY);
    expect(sent).toHaveLength(2);
  });

  it("waits a minute when the new address just got another email, for an address with or without an account", async () => {
    await forgotPassword(db, json({ email: NEW }), deps);
    sent = [];

    expect(await move(anna, { email: NEW, password: ANNA_PASSWORD })).toMatchObject({ status: 429 });
    expect(sent).toEqual([]);
  });

  it("refuses the own email, a bad email and a malformed body", async () => {
    expect(await move(anna, { email: "ANNA@example.com", password: ANNA_PASSWORD })).toMatchObject({
      status: 400,
      body: { error: "same-email" },
    });
    for (const email of ["anna", "anna@example", `${"a".repeat(250)}@x.com`]) {
      expect(await move(anna, { email, password: ANNA_PASSWORD })).toMatchObject({
        status: 400,
        body: { error: "invalid-email" },
      });
    }
    for (const body of ["not json", "[]", json({ email: NEW }), json({ email: 1, password: ANNA_PASSWORD })]) {
      expect(await move(anna, body)).toMatchObject({
        status: 400,
        body: { error: "malformed" },
      });
    }
    expect(sent).toEqual([]);
  });

  it("is refused without a working session", async () => {
    expect(await move(undefined, { email: NEW, password: ANNA_PASSWORD })).toEqual(LOG_IN_NEEDED);
    expect(await move("x".repeat(64), { email: NEW, password: ANNA_PASSWORD })).toEqual(LOG_IN_NEEDED);
    expect(sent).toEqual([]);
  });
});

describe("what the replies never contain", () => {
  it("no hash, token or another person's email in any reply", async () => {
    await account("ben@example.com", "Ben_1", "ben-secret-1");
    const replies = [
      await changeUsername(db, anna, json({ username: "Annika_7" }), deps),
      await changeUsername(db, anna, json({ username: "Ben_1" }), deps),
      await changeEmail(db, anna, json({ email: "ben@example.com", password: ANNA_PASSWORD }), deps),
      await changeEmail(db, anna, json({ email: "ben@example.com", password: "wrong-password" }), deps),
    ];
    later(2 * MINUTE);
    replies.push(await changeEmail(db, anna, json({ email: "new@example.org", password: ANNA_PASSWORD }), deps));
    const token = decodeURIComponent(sent.find((e) => e.to === "new@example.org")!.text.match(/token=([^\s]+)/)![1]);
    replies.push(await confirmEmailChange(db, json({ token }), deps));
    replies.push(
      await changePassword(db, anna, json({ currentPassword: ANNA_PASSWORD, newPassword: "x-new-pass-1" }), deps),
    );
    replies.push(
      await changePassword(db, anna, json({ currentPassword: "wrong-pass", newPassword: "x-new-pass-2" }), deps),
    );

    for (const reply of replies) {
      const text = JSON.stringify(reply);
      expect(text).not.toMatch(/scrypt|token|[0-9a-f]{64}|@/);
      expect(reply.setCookie).toBeUndefined();
    }
  });
});
