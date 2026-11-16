import { beforeEach, describe, expect, it } from "vitest";
import { signUp } from "@/lib/api/accounts";
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
