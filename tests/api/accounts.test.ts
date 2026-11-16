import { beforeEach, describe, expect, it } from "vitest";
import {
  forgotPassword,
  logIn,
  logOut,
  readRequestBody,
  resendVerification,
  resetPassword,
  signUp,
  verifyEmail,
  whoIsLoggedIn,
} from "@/lib/api/accounts";
import type { TransactionDb } from "@/lib/db/client";
import type { Email } from "@/lib/email/sender";
import { createTestDb } from "../helpers/test-db";

// Sign-up from start to finish, against PGlite, with a fake clock, a fake email sender and a predictable
// token maker. No network.
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
  // Long like a real token, but predictable: token-1-aaaa…, token-2-aaaa…
  makeToken: () => `token-${++tokenCount}-${"a".repeat(40)}`,
};

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-16T12:00:00.000Z");
  sent = [];
  tokenCount = 0;
});

// Moves the fake clock forward. Each address gets at most one email per minute.
const MINUTE = 60 * 1000;
const later = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

const CHECK_INBOX = { status: 200, body: { message: "Check your inbox to finish signing up" } };

const signup = (body: unknown) => signUp(db, typeof body === "string" ? body : JSON.stringify(body), deps);

const valid = { email: "Anna@Example.com", username: "Anna_99", password: "correct-horse" };

describe("POST /api/accounts/signup", () => {
  it("creates an unverified account and sends a verification link", async () => {
    const result = await signup(valid);

    expect(result).toEqual(CHECK_INBOX);
    const users = await db.query("SELECT username, email, email_verified_at FROM users");
    expect(users).toEqual([{ username: "Anna_99", email: "anna@example.com", email_verified_at: null }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("anna@example.com");
    expect(sent[0].text).toContain(`/verify-email?token=token-1-${"a".repeat(40)}`);
  });
});

describe("POST /api/accounts/signup – input rules", () => {
  const withField = (field: string, value: unknown) => signup({ ...valid, [field]: value });
  const rejected = (error: string) => ({ status: 400, body: { error, message: expect.any(String) } });

  it("accepts usernames of 3 and 20 characters with letters, digits and _", async () => {
    expect(await signup({ ...valid, email: "a@example.com", username: "abc" })).toEqual(CHECK_INBOX);
    expect(await signup({ ...valid, email: "b@example.com", username: "A_b_C_1234567890_xyz" })).toEqual(CHECK_INBOX);
  });

  it.each([
    ["2 characters", "ab"],
    ["21 characters", "a".repeat(21)],
    ["an @", "anna@home"],
    ["a space", "anna b"],
    ["an accent", "Zoë_1"],
    ["an emoji", "anna🎵"],
    ["a dash", "anna-b"],
    ["nothing", ""],
  ])("rejects a username with %s", async (_label, username) => {
    expect(await withField("username", username)).toEqual(rejected("invalid-username"));
    expect(sent).toEqual([]);
  });

  it.each([
    ["no @", "anna.example.com"],
    ["two @", "anna@b@example.com"],
    ["no dot after the @", "anna@example"],
    ["a space", "anna @example.com"],
    ["nothing before the @", "@example.com"],
    ["more than 254 characters", `${"a".repeat(243)}@example.com`],
  ])("rejects an email with %s", async (_label, email) => {
    expect(await withField("email", email)).toEqual(rejected("invalid-email"));
  });

  it("accepts an email of exactly 254 characters", async () => {
    expect(await withField("email", `${"a".repeat(242)}@example.com`)).toEqual(CHECK_INBOX);
  });

  it("accepts passwords of 8 and 128 characters, rejects 7 and 129", async () => {
    expect(await signup({ ...valid, email: "a@example.com", username: "user_a", password: "a".repeat(8) })).toEqual(
      CHECK_INBOX,
    );
    expect(await signup({ ...valid, email: "b@example.com", username: "user_b", password: "a".repeat(128) })).toEqual(
      CHECK_INBOX,
    );
    expect(await withField("password", "a".repeat(7))).toEqual(rejected("invalid-password"));
    expect(await withField("password", "a".repeat(129))).toEqual(rejected("invalid-password"));
  });

  it.each([
    ["a space in the middle", "correct horse"],
    ["a space at the start", " correct-horse"],
    ["a space at the end", "correct-horse "],
    ["a tab", "correct\thorse"],
  ])("rejects a password with %s", async (_, password) => {
    expect(await withField("password", password)).toEqual({
      status: 400,
      body: { error: "invalid-password", message: "Passwords are 8–128 characters long, without spaces." },
    });
  });

  it("rejects missing fields, wrong types, bad JSON and a body that is too big", async () => {
    expect(await signup({ email: valid.email, username: valid.username })).toEqual(rejected("malformed"));
    expect(await withField("username", 42)).toEqual(rejected("malformed"));
    expect(await signup([valid])).toEqual(rejected("malformed"));
    expect(await signup("not json")).toEqual(rejected("malformed"));
    expect(await signup({ ...valid, extra: "x".repeat(5000) })).toEqual(rejected("malformed"));
    expect(await db.query("SELECT id FROM users")).toEqual([]);
  });
});

describe("POST /api/accounts/signup – taken and replaced accounts", () => {
  it("rejects a username that is taken in another letter case, and sends nothing", async () => {
    await signup(valid);
    sent = [];

    const result = await signup({ ...valid, email: "other@example.com", username: "ANNA_99" });

    expect(result).toEqual({ status: 409, body: { error: "username-taken", message: "This username is taken" } });
    expect(sent).toEqual([]);
    expect(await db.query("SELECT email FROM users")).toEqual([{ email: "anna@example.com" }]);
  });

  it("replaces a pending account when its email signs up again: new username, password and link", async () => {
    await signup(valid);
    const [before] = await db.query<{ password_hash: string }>("SELECT password_hash FROM users");
    later(MINUTE);

    const result = await signup({ email: "ANNA@example.com", username: "Anna_New", password: "another-secret" });

    expect(result).toEqual(CHECK_INBOX);
    const users = await db.query<{ username: string; password_hash: string }>("SELECT username, password_hash FROM users");
    expect(users.map((u) => u.username)).toEqual(["Anna_New"]);
    expect(users[0].password_hash).not.toBe(before.password_hash);
    expect(sent.map((e) => e.to)).toEqual(["anna@example.com", "anna@example.com"]);
    expect(sent[1].text).toContain(`token=token-2-`);
    // The old link is gone: only the new one is stored.
    expect(await db.query("SELECT purpose FROM email_tokens")).toEqual([{ purpose: "verify" }]);
  });

  it("frees the old username of a replaced pending account", async () => {
    await signup(valid);
    later(MINUTE);
    await signup({ ...valid, username: "Anna_New" });

    expect(await signup({ ...valid, email: "other@example.com", username: "anna_99" })).toEqual(CHECK_INBOX);
  });

  it("keeps the username of a pending account while its verification link still works", async () => {
    await signup(valid);
    later(24 * 60 * MINUTE - 1);

    expect((await signup({ ...valid, email: "other@example.com", username: "anna_99" })).status).toBe(409);
  });

  it("frees the username of a pending account whose link expired unused, and removes that account", async () => {
    await signup(valid);
    later(24 * 60 * MINUTE + 1);

    expect(await signup({ ...valid, email: "other@example.com", username: "anna_99" })).toEqual(CHECK_INBOX);
    expect(await db.query("SELECT email, username FROM users")).toEqual([
      { email: "other@example.com", username: "anna_99" },
    ]);
  });

  it("keeps the username blocked while a new link from 'Send the email again' still works", async () => {
    await signup(valid);
    later(23 * 60 * MINUTE);
    await resendVerification(db, JSON.stringify({ email: valid.email }), deps);
    later(2 * 60 * MINUTE);

    expect((await signup({ ...valid, email: "other@example.com", username: "anna_99" })).status).toBe(409);
  });

  it("never frees the username of a verified account", async () => {
    await signup(valid);
    await verifyEmail(db, JSON.stringify({ token: `token-1-${"a".repeat(40)}` }), deps);
    later(48 * 60 * MINUTE);

    expect((await signup({ ...valid, email: "other@example.com", username: "anna_99" })).status).toBe(409);
  });

  it("lets exactly one of two sign-ups at the same moment with the same username (any case) win", async () => {
    const results = await Promise.all([
      signup({ ...valid, email: "one@example.com", username: "Twin" }),
      signup({ ...valid, email: "two@example.com", username: "twin" }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.query("SELECT id FROM users")).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("keeps one account when two sign-ups with the same email arrive at the same moment", async () => {
    const results = await Promise.all([
      signup({ ...valid, username: "First" }),
      signup({ ...valid, username: "Second" }),
    ]);

    expect(results).toEqual([CHECK_INBOX, CHECK_INBOX]);
    expect(await db.query("SELECT id FROM users")).toHaveLength(1);
  });
});

describe("POST /api/accounts/signup – only hashes are stored", () => {
  it("stores the password only as a salted scrypt hash: the same password gives two different hashes", async () => {
    await signup({ ...valid, email: "one@example.com", username: "One" });
    await signup({ ...valid, email: "two@example.com", username: "Two" });

    const hashes = (await db.query<{ password_hash: string }>("SELECT password_hash FROM users")).map((r) => r.password_hash);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
    for (const hash of hashes) {
      expect(hash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
      expect(hash).not.toContain(valid.password);
    }
  });

  it("stores only the SHA-256 hash of the link token, with purpose verify and a 24-hour lifetime", async () => {
    await signup(valid);
    const token = `token-1-${"a".repeat(40)}`;
    // SHA-256 of the token above, worked out independently (e.g. `printf %s <token> | sha256sum`).
    const expectedHash = "2a2093e12c2870c302de1e741a9853ac714c762ebcb6a82f0e340021f36ec3e0";

    const tokens = await db.query<{ token_hash: string; purpose: string; expires_at: Date }>(
      "SELECT token_hash, purpose, expires_at FROM email_tokens",
    );
    expect(tokens).toEqual([
      { token_hash: expectedHash, purpose: "verify", expires_at: new Date("2026-11-17T12:00:00.000Z") },
    ]);
    expect(JSON.stringify(tokens)).not.toContain(token);
  });

  it("never puts a password, hash or token in a reply", async () => {
    const replies = [
      await signup(valid),
      await signup({ ...valid, username: "Anna_New" }),
      await signup({ ...valid, email: "other@example.com" }),
      await signup({ ...valid, password: "short" }),
    ];
    const stored = await db.query<{ password_hash: string }>("SELECT password_hash FROM users");
    const tokenHashes = await db.query<{ token_hash: string }>("SELECT token_hash FROM email_tokens");

    const text = JSON.stringify(replies);
    expect(text).not.toContain(valid.password);
    expect(text).not.toContain("token-");
    expect(text).not.toContain("scrypt");
    for (const row of stored) expect(text).not.toContain(row.password_hash);
    for (const row of tokenHashes) expect(text).not.toContain(row.token_hash);
  });
});

const verify = (body: unknown) => verifyEmail(db, typeof body === "string" ? body : JSON.stringify(body), deps);
const firstToken = `token-1-${"a".repeat(40)}`;
const HOUR = 60 * 60 * 1000;

describe("POST /api/accounts/verify-email", () => {
  it("marks the account verified with the link from the sign-up email", async () => {
    await signup(valid);

    const result = await verify({ token: firstToken });

    expect(result).toEqual({ status: 200, body: { message: "Your email is verified – you can log in now" } });
    expect(await db.query("SELECT email_verified_at FROM users")).toEqual([
      { email_verified_at: new Date("2026-11-16T12:00:00.000Z") },
    ]);
  });
});

describe("POST /api/accounts/verify-email – links that do not work", () => {
  const linkError = (status: number, error: string) => ({ status, body: { error, message: expect.any(String) } });
  const verifiedAt = () => db.query("SELECT email_verified_at FROM users");

  it("still works one millisecond before 24 hours are up", async () => {
    await signup(valid);
    clock = new Date(clock.getTime() + 24 * HOUR - 1);

    expect((await verify({ token: firstToken })).status).toBe(200);
  });

  it("refuses a link opened just after 24 hours, and the account stays unverified", async () => {
    await signup(valid);
    clock = new Date(clock.getTime() + 24 * HOUR + 1);

    expect(await verify({ token: firstToken })).toEqual(linkError(400, "link-expired"));
    expect(await verifiedAt()).toEqual([{ email_verified_at: null }]);
  });

  it("tells the person with an expired link to log in and ask for the email again, not to sign up again", async () => {
    await signup(valid);
    clock = new Date(clock.getTime() + 24 * HOUR + 1);

    const { message } = (await verify({ token: firstToken })).body as { message: string };
    expect(message).toContain("log in");
    expect(message).toContain("Send the email again");
    expect(message).not.toContain("sign up");
  });

  it("works only once: the second click says the link was already used", async () => {
    await signup(valid);
    await verify({ token: firstToken });
    clock = new Date(clock.getTime() + HOUR);

    expect(await verify({ token: firstToken })).toEqual(linkError(400, "link-used"));
    // Still verified at the time of the first click.
    expect(await verifiedAt()).toEqual([{ email_verified_at: new Date("2026-11-16T12:00:00.000Z") }]);
  });

  it("lets exactly one of two clicks at the same moment use the link", async () => {
    await signup(valid);

    const results = await Promise.all([verify({ token: firstToken }), verify({ token: firstToken })]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("refuses an unknown token", async () => {
    await signup(valid);

    expect(await verify({ token: `token-9-${"a".repeat(40)}` })).toEqual(linkError(404, "link-unknown"));
    expect(await verifiedAt()).toEqual([{ email_verified_at: null }]);
  });

  it("refuses the old link of a pending account that signed up again", async () => {
    await signup(valid);
    later(MINUTE);
    await signup({ ...valid, username: "Anna_New" });

    expect(await verify({ token: firstToken })).toEqual(linkError(404, "link-unknown"));
    expect((await verify({ token: `token-2-${"a".repeat(40)}` })).status).toBe(200);
  });

  it("rejects a missing, empty, too long or non-text token and bad JSON", async () => {
    const malformed = linkError(400, "malformed");
    expect(await verify({})).toEqual(malformed);
    expect(await verify({ token: "" })).toEqual(malformed);
    expect(await verify({ token: "a".repeat(201) })).toEqual(malformed);
    expect(await verify({ token: 42 })).toEqual(malformed);
    expect(await verify(null)).toEqual(malformed);
    expect(await verify("not json")).toEqual(malformed);
  });

  it("never puts the token or its hash in a reply", async () => {
    await signup(valid);
    const [{ token_hash }] = await db.query<{ token_hash: string }>("SELECT token_hash FROM email_tokens");

    const text = JSON.stringify([
      await verify({ token: firstToken }),
      await verify({ token: firstToken }),
      await verify({ token: "unknown-token" }),
    ]);
    expect(text).not.toContain("token-1-");
    expect(text).not.toContain(token_hash);
  });
});

describe("POST /api/accounts/signup – email of a verified account", () => {
  it("creates nothing, sends the 'you already have an account' email and gives the same reply", async () => {
    await signup(valid);
    await verify({ token: firstToken });
    later(MINUTE);
    sent = [];

    const result = await signup({ email: "ANNA@example.com", username: "Someone_Else", password: "another-secret" });

    expect(result).toEqual(CHECK_INBOX);
    expect(await db.query("SELECT username, email FROM users")).toEqual([
      { username: "Anna_99", email: "anna@example.com" },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("anna@example.com");
    expect(sent[0].subject).toBe("You already have an account");
    expect(sent[0].text).toContain("Forgot your password?");
    expect(sent[0].text).toContain("http://localhost:3000/forgot-password");
    expect(sent[0].text).not.toContain("verify-email");
    // No new verification link was made: only the used one is stored.
    expect(await db.query("SELECT used_at FROM email_tokens")).toEqual([
      { used_at: new Date("2026-11-16T12:00:00.000Z") },
    ]);
  });

  it("still says the username is taken when both the username and the email belong to the verified account", async () => {
    await signup(valid);
    await verify({ token: firstToken });
    sent = [];

    expect((await signup(valid)).status).toBe(409);
    expect(sent).toEqual([]);
  });
});

const DAY = 24 * HOUR;
const login = (body: unknown) => logIn(db, typeof body === "string" ? body : JSON.stringify(body), deps);

// Signs up `valid` and opens the verification link, so the account can log in.
async function verifiedAccount() {
  await signup(valid);
  await verify({ token: firstToken });
}

describe("POST /api/accounts/login", () => {
  it("logs in by username in another letter case and starts a 30-day session in a safe cookie", async () => {
    await verifiedAccount();

    const result = await login({ login: "anna_99", password: valid.password });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ username: "Anna_99" });
    const sessionToken = `token-2-${"a".repeat(40)}`;
    expect(result.setCookie).toBe(
      `session=${sessionToken}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
    );
  });
});

describe("POST /api/accounts/login – other ways in and refusals", () => {
  const WRONG_LOGIN = { status: 401, body: { error: "wrong-login", message: "Wrong username/email or password" } };
  const sessionCount = async () => (await db.query("SELECT token_hash FROM sessions")).length;

  it("logs in by email in another letter case", async () => {
    await verifiedAccount();

    const result = await login({ login: "ANNA@example.COM", password: valid.password });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ username: "Anna_99" });
    expect(await sessionCount()).toBe(1);
  });

  it("gives the same reply for a wrong password, an unknown username and an unknown email, with no session", async () => {
    await verifiedAccount();

    const replies = [
      await login({ login: "Anna_99", password: "wrong password" }),
      await login({ login: "anna@example.com", password: "Correct-Horse" }),
      await login({ login: "Nobody", password: valid.password }),
      await login({ login: "nobody@example.com", password: valid.password }),
    ];

    for (const reply of replies) expect(reply).toEqual(WRONG_LOGIN);
    expect(await sessionCount()).toBe(0);
  });

  it("does not treat a username as an email or the other way round", async () => {
    await verifiedAccount();

    expect(await login({ login: "Anna_99@example.com", password: valid.password })).toEqual(WRONG_LOGIN);
    expect(await login({ login: "anna", password: valid.password })).toEqual(WRONG_LOGIN);
  });

  it("refuses the right password of an account that is not verified yet, with no session", async () => {
    await signup(valid);

    expect(await login({ login: "Anna_99", password: valid.password })).toEqual({
      status: 403,
      body: { error: "not-verified", message: "Verify your email first" },
    });
    expect(await sessionCount()).toBe(0);
  });

  it("gives an unverified account with a wrong password the normal wrong-login reply", async () => {
    await signup(valid);

    expect(await login({ login: "Anna_99", password: "wrong password" })).toEqual(WRONG_LOGIN);
  });

  it("rejects missing fields, wrong types, too long values and bad JSON", async () => {
    await verifiedAccount();
    const malformed = { status: 400, body: { error: "malformed", message: expect.any(String) } };

    expect(await login({ login: "Anna_99" })).toEqual(malformed);
    expect(await login({ login: 42, password: valid.password })).toEqual(malformed);
    expect(await login({ login: "Anna_99", password: "a".repeat(129) })).toEqual(malformed);
    expect(await login({ login: `${"a".repeat(243)}@example.com`, password: valid.password })).toEqual(malformed);
    expect(await login(null)).toEqual(malformed);
    expect(await login("not json")).toEqual(malformed);
    expect(await sessionCount()).toBe(0);
  });

  it("stores only the SHA-256 hash of the session token, ending after 30 days", async () => {
    await verifiedAccount();
    await login({ login: "Anna_99", password: valid.password });

    // SHA-256 of token-2-aaaa… (40 a), worked out independently (`printf %s <token> | sha256sum`).
    expect(await db.query("SELECT token_hash, created_at, expires_at FROM sessions")).toEqual([
      {
        token_hash: "0dd69f20828bcfa911a43435a372bbc348f88047df35a1c36ba3265c699a88b6",
        created_at: new Date("2026-11-16T12:00:00.000Z"),
        expires_at: new Date("2026-12-16T12:00:00.000Z"),
      },
    ]);
  });
});

const sessionToken = `token-2-${"a".repeat(40)}`;
const me = (token: string | undefined) => whoIsLoggedIn(db, token, deps);
const NOBODY = { status: 200, body: { username: null } };

async function loggedIn() {
  await verifiedAccount();
  await login({ login: "Anna_99", password: valid.password });
}

describe("GET /api/accounts/me", () => {
  it("returns the username for a valid session, up to just before 30 days", async () => {
    await loggedIn();

    expect(await me(sessionToken)).toEqual({ status: 200, body: { username: "Anna_99" } });
    clock = new Date(clock.getTime() + 30 * DAY - 1);
    expect(await me(sessionToken)).toEqual({ status: 200, body: { username: "Anna_99" } });
  });

  it("returns nobody once the session is 30 days old", async () => {
    await loggedIn();
    clock = new Date(clock.getTime() + 30 * DAY);

    expect(await me(sessionToken)).toEqual(NOBODY);
  });

  it("returns nobody for an unknown, empty, too long or missing session token", async () => {
    await loggedIn();

    expect(await me(`token-9-${"a".repeat(40)}`)).toEqual(NOBODY);
    expect(await me("")).toEqual(NOBODY);
    expect(await me("a".repeat(201))).toEqual(NOBODY);
    expect(await me(undefined)).toEqual(NOBODY);
  });
});

describe("POST /api/accounts/logout", () => {
  const CLEAR_COOKIE = "session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";

  it("ends the session on the server and clears the cookie", async () => {
    await loggedIn();

    const result = await logOut(db, sessionToken);

    expect(result).toEqual({ status: 200, body: { username: null }, setCookie: CLEAR_COOKIE });
    expect(await me(sessionToken)).toEqual(NOBODY);
    expect(await db.query("SELECT token_hash FROM sessions")).toEqual([]);
  });

  it("ends only this session: another browser of the same account stays logged in", async () => {
    await loggedIn();
    await login({ login: "anna@example.com", password: valid.password });

    await logOut(db, sessionToken);

    expect(await me(`token-3-${"a".repeat(40)}`)).toEqual({ status: 200, body: { username: "Anna_99" } });
  });

  it("still clears the cookie without a session or with an unknown one", async () => {
    expect(await logOut(db, undefined)).toEqual({ status: 200, body: { username: null }, setCookie: CLEAR_COOKIE });
    expect(await logOut(db, "unknown-token")).toEqual({ status: 200, body: { username: null }, setCookie: CLEAR_COOKIE });
  });
});

describe("Login, me and logout – no secrets in replies", () => {
  it("never puts the password, its hash, a session token or a token hash in a reply body", async () => {
    await verifiedAccount();
    const replies = [
      await login({ login: "Anna_99", password: valid.password }),
      await login({ login: "Anna_99", password: "wrong password" }),
      await login({ login: "nobody@example.com", password: valid.password }),
      await me(sessionToken),
      await logOut(db, sessionToken),
    ];
    const [{ password_hash }] = await db.query<{ password_hash: string }>("SELECT password_hash FROM users");

    const bodies = JSON.stringify(replies.map((r) => r.body));
    expect(bodies).not.toContain(valid.password);
    expect(bodies).not.toContain(password_hash);
    expect(bodies).not.toContain("scrypt");
    expect(bodies).not.toContain("token-");
    expect(bodies).not.toContain("0dd69f20828bcfa911a43435a372bbc348f88047df35a1c36ba3265c699a88b6");
    expect(bodies).not.toContain("anna@example.com");
  });
});

const resend = (body: unknown) =>
  resendVerification(db, typeof body === "string" ? body : JSON.stringify(body), deps);
const RESENT = {
  status: 200,
  body: { message: "If that address has an account that is not verified yet, we sent it a new link" },
};
const TOO_SOON = {
  status: 429,
  body: { error: "too-soon", message: "Please wait a minute before asking for another email" },
};

describe("POST /api/accounts/resend-verification", () => {
  it("sends an unverified account a new link that verifies it", async () => {
    await signup(valid);
    later(MINUTE);
    sent = [];

    const result = await resend({ email: "ANNA@example.com" });

    expect(result).toEqual(RESENT);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("anna@example.com");
    expect(sent[0].text).toContain(`/verify-email?token=token-2-${"a".repeat(40)}`);
    expect(await verify({ token: `token-2-${"a".repeat(40)}` })).toEqual({
      status: 200,
      body: { message: "Your email is verified – you can log in now" },
    });
  });
});

describe("POST /api/accounts/resend-verification – nothing to send", () => {
  it("gives a verified account and an unknown address the same reply and sends nothing", async () => {
    await verifiedAccount();
    later(MINUTE);
    sent = [];

    expect(await resend({ email: "anna@example.com" })).toEqual(RESENT);
    expect(await resend({ email: "nobody@example.com" })).toEqual(RESENT);
    expect(sent).toEqual([]);
    expect(await db.query("SELECT token_hash FROM email_tokens")).toHaveLength(1);
  });

  it("rejects a missing or invalid email and bad JSON, and sends nothing", async () => {
    await signup(valid);
    later(MINUTE);
    sent = [];

    expect(await resend({})).toEqual({ status: 400, body: { error: "malformed", message: expect.any(String) } });
    expect(await resend({ email: 42 })).toEqual({ status: 400, body: { error: "malformed", message: expect.any(String) } });
    expect(await resend("{not json")).toEqual({ status: 400, body: { error: "malformed", message: expect.any(String) } });
    expect(await resend({ email: "anna.example.com" })).toEqual({
      status: 400,
      body: { error: "invalid-email", message: expect.any(String) },
    });
    expect(sent).toEqual([]);
  });
});

describe("At most one email per address per minute", () => {
  const SECOND = 1000;

  it("refuses a second resend within 60 seconds and sends nothing; at 60 seconds it sends again", async () => {
    await signup(valid);
    later(MINUTE);
    await resend({ email: valid.email });
    sent = [];

    later(59 * SECOND);
    expect(await resend({ email: valid.email })).toEqual(TOO_SOON);
    expect(sent).toEqual([]);

    later(1 * SECOND);
    expect(await resend({ email: valid.email })).toEqual(RESENT);
    expect(sent).toHaveLength(1);
  });

  it("counts the sign-up email: a resend 59 seconds after signing up is refused", async () => {
    await signup(valid);
    sent = [];

    later(59 * SECOND);
    expect(await resend({ email: valid.email })).toEqual(TOO_SOON);
    expect(sent).toEqual([]);
    expect(await db.query("SELECT token_hash FROM email_tokens")).toHaveLength(1);
  });

  it("limits an unknown address and a verified account like an unverified one, so the reply does not reveal an account", async () => {
    await verifiedAccount();
    later(MINUTE);
    sent = [];

    expect(await resend({ email: "nobody@example.com" })).toEqual(RESENT);
    expect(await resend({ email: "anna@example.com" })).toEqual(RESENT);
    later(59 * SECOND);
    expect(await resend({ email: "nobody@example.com" })).toEqual(TOO_SOON);
    expect(await resend({ email: "anna@example.com" })).toEqual(TOO_SOON);
    later(1 * SECOND);
    expect(await resend({ email: "nobody@example.com" })).toEqual(RESENT);
    expect(sent).toEqual([]);
  });

  it("keeps a pending account and its link when its email signs up again within 60 seconds, and sends nothing", async () => {
    await signup(valid);
    sent = [];

    later(59 * SECOND);
    expect(await signup({ ...valid, username: "Anna_New", password: "another-secret" })).toEqual(CHECK_INBOX);
    expect(sent).toEqual([]);
    expect(await db.query("SELECT username FROM users")).toEqual([{ username: "Anna_99" }]);
    expect(await db.query("SELECT purpose FROM email_tokens")).toEqual([{ purpose: "verify" }]);

    later(1 * SECOND);
    expect(await resend({ email: valid.email })).toEqual(RESENT);
    expect(sent).toHaveLength(1);
    // The first link still works, and the account keeps its first password.
    expect((await verify({ token: firstToken })).status).toBe(200);
    expect((await login({ login: "Anna_99", password: valid.password })).status).toBe(200);
  });

  it("keeps a pending account when its email signs up again with the same username within 60 seconds", async () => {
    await signup(valid);
    sent = [];

    later(59 * SECOND);
    expect(await signup(valid)).toEqual(CHECK_INBOX);
    expect(sent).toEqual([]);
    expect((await verify({ token: firstToken })).status).toBe(200);
  });

  it("counts the 'you already have an account' email: within 60 seconds of the last email it is not sent", async () => {
    await verifiedAccount();
    sent = [];

    later(59 * SECOND);
    expect(await signup({ ...valid, username: "Someone_Else" })).toEqual(CHECK_INBOX);
    expect(sent).toEqual([]);

    later(1 * SECOND);
    expect(await signup({ ...valid, username: "Someone_Else" })).toEqual(CHECK_INBOX);
    expect(sent.map((e) => e.subject)).toEqual(["You already have an account"]);

    later(59 * SECOND);
    expect(await signup({ ...valid, username: "Someone_Else" })).toEqual(CHECK_INBOX);
    expect(sent).toHaveLength(1);
  });
});

const forgot = (body: unknown) => forgotPassword(db, typeof body === "string" ? body : JSON.stringify(body), deps);
const IF_EXISTS = { status: 200, body: { message: "If an account exists for that address, we sent an email" } };

describe("POST /api/accounts/forgot-password", () => {
  it("gives the same reply for a known and an unknown email; only the known one gets a reset link", async () => {
    await verifiedAccount();
    clock = new Date(clock.getTime() + MINUTE);
    sent = [];

    expect(await forgot({ email: "nobody@example.com" })).toEqual(IF_EXISTS);
    expect(sent).toEqual([]);
    expect(await forgot({ email: "ANNA@example.com" })).toEqual(IF_EXISTS);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("anna@example.com");
    expect(sent[0].text).toContain(`/reset-password?token=token-2-${"a".repeat(40)}`);
  });
});

describe("POST /api/accounts/forgot-password – one email per minute and input rules", () => {
  const TOO_SOON = {
    status: 429,
    body: { error: "too-soon", message: "Please wait a minute before asking for another email" },
  };

  it("refuses a known address asked again within 60 s, and allows it again once 60 s have passed", async () => {
    await verifiedAccount();
    clock = new Date(clock.getTime() + MINUTE);
    sent = [];

    expect(await forgot({ email: "anna@example.com" })).toEqual(IF_EXISTS);
    clock = new Date(clock.getTime() + MINUTE - 1);
    expect(await forgot({ email: "anna@example.com" })).toEqual(TOO_SOON);
    expect(sent).toHaveLength(1);
    clock = new Date(clock.getTime() + 1);
    expect(await forgot({ email: "anna@example.com" })).toEqual(IF_EXISTS);
    expect(sent).toHaveLength(2);
  });

  it("counts the sign-up email: asking within 60 s of signing up is too soon", async () => {
    await signup(valid);
    sent = [];

    expect(await forgot({ email: "anna@example.com" })).toEqual(TOO_SOON);
    expect(sent).toEqual([]);
  });

  it("limits an unknown address the same way as a known one, so the reply does not reveal an account", async () => {
    expect(await forgot({ email: "nobody@example.com" })).toEqual(IF_EXISTS);
    clock = new Date(clock.getTime() + MINUTE - 1);
    expect(await forgot({ email: "NOBODY@example.com" })).toEqual(TOO_SOON);
    clock = new Date(clock.getTime() + 1);
    expect(await forgot({ email: "nobody@example.com" })).toEqual(IF_EXISTS);
    expect(sent).toEqual([]);
  });

  it("stores no plain address for an unknown email, only the SHA-256 hash of the lowercase address", async () => {
    await forgot({ email: "Nobody@Example.com" });

    const text = JSON.stringify(await db.query("SELECT * FROM email_throttle"));
    expect(text).not.toContain("nobody");
    // SHA-256 of "nobody@example.com", worked out independently (`printf %s nobody@example.com | sha256sum`).
    expect(text).toContain("e788ea2014693dcdb86767aceb3860a432fc626c6477a6c53016aff40726842b");
  });

  it("rejects a missing, non-text or invalid email and bad JSON", async () => {
    const error = (code: string) => ({ status: 400, body: { error: code, message: expect.any(String) } });

    expect(await forgot({})).toEqual(error("malformed"));
    expect(await forgot({ email: 42 })).toEqual(error("malformed"));
    expect(await forgot(null)).toEqual(error("malformed"));
    expect(await forgot("not json")).toEqual(error("malformed"));
    expect(await forgot({ email: "not-an-email" })).toEqual(error("invalid-email"));
    expect(await forgot({ email: `${"a".repeat(243)}@example.com` })).toEqual(error("invalid-email"));
    expect(sent).toEqual([]);
  });

  it("stores only the SHA-256 hash of the reset token, with purpose reset and a 1-hour lifetime", async () => {
    await verifiedAccount();
    clock = new Date(clock.getTime() + MINUTE);
    await forgot({ email: "anna@example.com" });

    // SHA-256 of token-2-aaaa… (40 a), the same value as in the session token test above.
    const rows = await db.query("SELECT token_hash, purpose, expires_at, used_at FROM email_tokens WHERE purpose = 'reset'");
    expect(rows).toEqual([
      {
        token_hash: "0dd69f20828bcfa911a43435a372bbc348f88047df35a1c36ba3265c699a88b6",
        purpose: "reset",
        expires_at: new Date("2026-11-16T13:01:00.000Z"),
        used_at: null,
      },
    ]);
  });
});

const reset = (body: unknown) => resetPassword(db, typeof body === "string" ? body : JSON.stringify(body), deps);
const PASSWORD_CHANGED = { status: 200, body: { message: "Your password is changed – you can log in now" } };
const NEW_PASSWORD = "brand-new-secret";

// A verified account, logged in on two browsers (sessions token-2 and token-3), that asks for a reset a minute
// later: the reset link is token-4.
const resetToken = `token-4-${"a".repeat(40)}`;
async function loggedInTwiceAndAskedForReset() {
  await verifiedAccount();
  await login({ login: "Anna_99", password: valid.password });
  await login({ login: "Anna_99", password: valid.password });
  clock = new Date(clock.getTime() + MINUTE);
  await forgot({ email: "anna@example.com" });
}

describe("POST /api/accounts/reset-password", () => {
  it("replaces the password and ends every session: old password and sessions stop working, the new one logs in", async () => {
    await loggedInTwiceAndAskedForReset();

    expect(await reset({ token: resetToken, password: NEW_PASSWORD })).toEqual(PASSWORD_CHANGED);

    expect(await me(sessionToken)).toEqual(NOBODY);
    expect(await me(`token-3-${"a".repeat(40)}`)).toEqual(NOBODY);
    expect((await login({ login: "Anna_99", password: valid.password })).status).toBe(401);
    expect(await login({ login: "Anna_99", password: NEW_PASSWORD })).toMatchObject({
      status: 200,
      body: { username: "Anna_99" },
    });
  });

  it("marks an account that was never verified as verified, so it can log in", async () => {
    await signup(valid);
    clock = new Date(clock.getTime() + MINUTE);
    await forgot({ email: "anna@example.com" });

    expect(await reset({ token: `token-2-${"a".repeat(40)}`, password: NEW_PASSWORD })).toEqual(PASSWORD_CHANGED);
    expect(await db.query("SELECT email_verified_at FROM users")).toEqual([
      { email_verified_at: new Date("2026-11-16T12:01:00.000Z") },
    ]);
    expect((await login({ login: "Anna_99", password: NEW_PASSWORD })).status).toBe(200);
  });

  it("keeps the first verification time of an account that was already verified", async () => {
    await loggedInTwiceAndAskedForReset();
    await reset({ token: resetToken, password: NEW_PASSWORD });

    expect(await db.query("SELECT email_verified_at FROM users")).toEqual([
      { email_verified_at: new Date("2026-11-16T12:00:00.000Z") },
    ]);
  });
});

describe("POST /api/accounts/reset-password – links and passwords that do not work", () => {
  const linkError = (status: number, error: string) => ({ status, body: { error, message: expect.any(String) } });
  const passwordHash = async () =>
    (await db.query<{ password_hash: string }>("SELECT password_hash FROM users"))[0].password_hash;

  it("still works one millisecond before 1 hour is up", async () => {
    await loggedInTwiceAndAskedForReset();
    clock = new Date(clock.getTime() + HOUR - 1);

    expect(await reset({ token: resetToken, password: NEW_PASSWORD })).toEqual(PASSWORD_CHANGED);
  });

  it("refuses a link opened after 1 hour: nothing changes and the sessions keep working", async () => {
    await loggedInTwiceAndAskedForReset();
    const before = await passwordHash();
    clock = new Date(clock.getTime() + HOUR);

    const result = await reset({ token: resetToken, password: NEW_PASSWORD });

    expect(result).toEqual(linkError(400, "link-expired"));
    expect(result.body.message).toContain("Forgot password");
    expect(await passwordHash()).toBe(before);
    expect(await me(sessionToken)).toEqual({ status: 200, body: { username: "Anna_99" } });
  });

  it("works only once: the second use says the link was already used and keeps the first new password", async () => {
    await loggedInTwiceAndAskedForReset();
    await reset({ token: resetToken, password: NEW_PASSWORD });

    expect(await reset({ token: resetToken, password: "a-different-secret" })).toEqual(linkError(400, "link-used"));
    expect((await login({ login: "Anna_99", password: NEW_PASSWORD })).status).toBe(200);
  });

  it("lets exactly one of two uses at the same moment change the password", async () => {
    await loggedInTwiceAndAskedForReset();

    const results = await Promise.all([
      reset({ token: resetToken, password: NEW_PASSWORD }),
      reset({ token: resetToken, password: NEW_PASSWORD }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("refuses an unknown token, and a verification link used as a reset link", async () => {
    await signup(valid);

    expect(await reset({ token: `token-9-${"a".repeat(40)}`, password: NEW_PASSWORD })).toEqual(
      linkError(404, "link-unknown"),
    );
    expect(await reset({ token: firstToken, password: NEW_PASSWORD })).toEqual(linkError(404, "link-unknown"));
    expect(await db.query("SELECT email_verified_at FROM users")).toEqual([{ email_verified_at: null }]);
  });

  it("refuses a password of 7 or 129 characters without using the link, so it can be tried again", async () => {
    await loggedInTwiceAndAskedForReset();
    const before = await passwordHash();

    expect(await reset({ token: resetToken, password: "a".repeat(7) })).toEqual(linkError(400, "invalid-password"));
    expect(await reset({ token: resetToken, password: "a".repeat(129) })).toEqual(linkError(400, "invalid-password"));
    expect(await reset({ token: resetToken, password: "brand new secret" })).toEqual(linkError(400, "invalid-password"));
    expect(await passwordHash()).toBe(before);
    expect(await me(sessionToken)).toEqual({ status: 200, body: { username: "Anna_99" } });
    expect(await reset({ token: resetToken, password: "a".repeat(8) })).toEqual(PASSWORD_CHANGED);
  });

  it("rejects a missing, empty, too long or non-text token, a missing password and bad JSON", async () => {
    const malformed = linkError(400, "malformed");

    expect(await reset({ password: NEW_PASSWORD })).toEqual(malformed);
    expect(await reset({ token: "", password: NEW_PASSWORD })).toEqual(malformed);
    expect(await reset({ token: "a".repeat(201), password: NEW_PASSWORD })).toEqual(malformed);
    expect(await reset({ token: 42, password: NEW_PASSWORD })).toEqual(malformed);
    expect(await reset({ token: resetToken })).toEqual(malformed);
    expect(await reset(null)).toEqual(malformed);
    expect(await reset("not json")).toEqual(malformed);
  });

  it("never puts the email, a password, a hash or a token in a reply", async () => {
    await loggedInTwiceAndAskedForReset();
    const replies = [
      await forgot({ email: "anna@example.com" }),
      await reset({ token: resetToken, password: NEW_PASSWORD }),
      await reset({ token: resetToken, password: NEW_PASSWORD }),
    ];

    const bodies = JSON.stringify(replies.map((r) => r.body));
    expect(bodies).not.toContain("anna@example.com");
    expect(bodies).not.toContain(NEW_PASSWORD);
    expect(bodies).not.toContain("scrypt");
    expect(bodies).not.toContain("token-");
  });
});

describe("Reading a request body", () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/accounts/signup", { method: "POST", body, headers, duplex: "half" } as RequestInit);

  // A body that would never end: the reader must stop on its own.
  function endlessStream(onPull: () => void): ReadableStream<Uint8Array> {
    return new ReadableStream({
      pull(controller) {
        onPull();
        controller.enqueue(new TextEncoder().encode("x".repeat(1000)));
      },
    });
  }

  it("returns a small body as text, including characters outside English", async () => {
    expect(await readRequestBody(post(JSON.stringify({ username: "Zoë 🎵" })))).toBe('{"username":"Zoë 🎵"}');
  });

  it("refuses a body whose Content-Length is too big without reading it", async () => {
    let pulls = 0;
    const request = post(endlessStream(() => pulls++), { "content-length": "1000000" });

    expect(await readRequestBody(request)).toBeNull();
    expect(pulls).toBeLessThanOrEqual(1);
  });

  it("stops reading a body without Content-Length once it is too big", async () => {
    let pulls = 0;

    expect(await readRequestBody(post(endlessStream(() => pulls++)))).toBeNull();
    expect(pulls).toBeLessThan(20);
  });

  it("gives the normal 400 reply for a body that was refused", async () => {
    expect(await signUp(db, null, deps)).toEqual({
      status: 400,
      body: { error: "malformed", message: expect.any(String) },
    });
  });
});
