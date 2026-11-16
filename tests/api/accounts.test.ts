import { beforeEach, describe, expect, it } from "vitest";
import { logIn, logOut, resendVerification, signUp, verifyEmail, whoIsLoggedIn } from "@/lib/api/accounts";
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

const valid = { email: "Anna@Example.com", username: "Anna_99", password: "correct horse" };

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

    const result = await signup({ email: "ANNA@example.com", username: "Anna_New", password: "another secret" });

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
    await signup({ ...valid, username: "Anna_New" });

    expect(await signup({ ...valid, email: "other@example.com", username: "anna_99" })).toEqual(CHECK_INBOX);
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

    expect(await verify({ token: firstToken })).toEqual(linkError(410, "link-expired"));
    expect(await verifiedAt()).toEqual([{ email_verified_at: null }]);
  });

  it("works only once: the second click says the link was already used", async () => {
    await signup(valid);
    await verify({ token: firstToken });
    clock = new Date(clock.getTime() + HOUR);

    expect(await verify({ token: firstToken })).toEqual(linkError(410, "link-used"));
    // Still verified at the time of the first click.
    expect(await verifiedAt()).toEqual([{ email_verified_at: new Date("2026-11-16T12:00:00.000Z") }]);
  });

  it("lets exactly one of two clicks at the same moment use the link", async () => {
    await signup(valid);

    const results = await Promise.all([verify({ token: firstToken }), verify({ token: firstToken })]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it("refuses an unknown token", async () => {
    await signup(valid);

    expect(await verify({ token: `token-9-${"a".repeat(40)}` })).toEqual(linkError(404, "link-unknown"));
    expect(await verifiedAt()).toEqual([{ email_verified_at: null }]);
  });

  it("refuses the old link of a pending account that signed up again", async () => {
    await signup(valid);
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

    const result = await signup({ email: "ANNA@example.com", username: "Someone_Else", password: "another secret" });

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
      await login({ login: "anna@example.com", password: "Correct Horse" }),
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

  it("counts a replaced pending account: signing up again within 60 seconds replaces it but sends nothing", async () => {
    await signup(valid);
    sent = [];

    later(59 * SECOND);
    expect(await signup({ ...valid, username: "Anna_New" })).toEqual(CHECK_INBOX);
    expect(sent).toEqual([]);
    expect(await db.query("SELECT username FROM users")).toEqual([{ username: "Anna_New" }]);

    later(1 * SECOND);
    expect(await resend({ email: valid.email })).toEqual(RESENT);
    expect(sent).toHaveLength(1);
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
