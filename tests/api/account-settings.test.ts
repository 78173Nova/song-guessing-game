import { beforeEach, describe, expect, it } from "vitest";
import { getAccountSettings, saveAccountSettings } from "@/lib/api/accounts";
import type { TransactionDb } from "@/lib/db/client";
import { AVATARS } from "@/lib/game/avatars";
import { loggedInSession } from "../helpers/session";
import { createTestDb } from "../helpers/test-db";

// Account settings (issue #44): the saved avatar and usual nickname of the logged-in account, against PGlite.
let db: TransactionDb;
let clock: Date;
let anna: string; // Anna's session cookie
const deps = { now: () => clock };

beforeEach(async () => {
  db = await createTestDb();
  clock = new Date("2026-11-17T12:00:00.000Z");
  anna = await loggedInSession(db, clock, "Anna_99");
});

const read = (session: string | undefined) => getAccountSettings(db, session, deps);
const save = (session: string | undefined, body: unknown) =>
  saveAccountSettings(db, session, typeof body === "string" ? body : JSON.stringify(body), deps);

const LOG_IN_NEEDED = { status: 401, body: { error: "log-in-needed", message: expect.any(String) } };

describe("GET /api/accounts/settings", () => {
  it("shows a new account with no avatar and no usual nickname yet", async () => {
    expect(await read(anna)).toEqual({ status: 200, body: { username: "Anna_99", avatar: null, nickname: null } });
  });

  it("is refused without a working session: missing, unknown or expired", async () => {
    expect(await read(undefined)).toEqual(LOG_IN_NEEDED);
    expect(await read("not-a-session")).toEqual(LOG_IN_NEEDED);
    expect(await read("x".repeat(64))).toEqual(LOG_IN_NEEDED);
    clock = new Date(clock.getTime() + 25 * 60 * 60 * 1000); // the test session lasts one day
    expect(await read(anna)).toEqual(LOG_IN_NEEDED);
  });
});

describe("POST /api/accounts/settings", () => {
  it("saves the avatar and the usual nickname (trimmed), and reading them gives them back", async () => {
    const result = await save(anna, { avatar: "fox", nickname: "  Annie  " });

    expect(result).toEqual({ status: 200, body: { username: "Anna_99", avatar: "fox", nickname: "Annie" } });
    expect(await read(anna)).toEqual(result);
  });

  it("changes them again, and an empty nickname removes the usual nickname", async () => {
    await save(anna, { avatar: "fox", nickname: "Annie" });

    expect(await save(anna, { avatar: "cat", nickname: "" })).toMatchObject({
      status: 200,
      body: { avatar: "cat", nickname: null },
    });
    expect(await save(anna, { avatar: "cat", nickname: null })).toMatchObject({ status: 200, body: { nickname: null } });
  });

  it("accepts every avatar of the fixed set, and nicknames of 1 and 20 characters (an emoji counts as one)", async () => {
    for (const avatar of AVATARS) {
      expect(await save(anna, { avatar: avatar.id, nickname: "A" })).toMatchObject({ status: 200 });
    }
    expect(await save(anna, { avatar: "fox", nickname: "🎵".repeat(20) })).toMatchObject({
      status: 200,
      body: { nickname: "🎵".repeat(20) },
    });
  });

  it.each([
    ["an unknown name", "dragon"],
    ["an emoji instead of a name", "🦊"],
    ["upper case", "FOX"],
    ["a number", 3],
    ["nothing", undefined],
    ["null", null],
  ])("refuses an avatar that is %s and saves nothing", async (_, avatar) => {
    expect(await save(anna, { avatar, nickname: "Annie" })).toEqual({
      status: 400,
      body: { error: "invalid-avatar", message: expect.any(String) },
    });
    expect((await read(anna)).body).toMatchObject({ avatar: null, nickname: null });
  });

  it.each([
    ["21 characters", "a".repeat(21)],
    ["only spaces", "   "],
    ["a new line", "An\nna"],
    ["a number", 7],
  ])("refuses a nickname with %s (same rules as in rooms) and saves nothing", async (_, nickname) => {
    expect(await save(anna, { avatar: "fox", nickname })).toEqual({
      status: 400,
      body: { error: "invalid-nickname", message: expect.any(String) },
    });
    expect((await read(anna)).body).toMatchObject({ avatar: null, nickname: null });
  });

  it("refuses a body that is not a JSON object", async () => {
    for (const body of ["not json", "[]", "null", JSON.stringify({ avatar: "fox", nickname: "x".repeat(3000) })]) {
      expect(await save(anna, body)).toMatchObject({ status: 400, body: { error: "malformed" } });
    }
  });

  it("is refused without a working session, and changes no account", async () => {
    expect(await save(undefined, { avatar: "fox", nickname: "Annie" })).toEqual(LOG_IN_NEEDED);
    expect(await save("y".repeat(64), { avatar: "fox", nickname: "Annie" })).toEqual(LOG_IN_NEEDED);
    expect((await read(anna)).body).toMatchObject({ avatar: null, nickname: null });
  });

  it("only changes the logged-in account", async () => {
    const ben = await loggedInSession(db, clock, "Ben_1");
    await save(ben, { avatar: "owl", nickname: "Benny" });

    expect((await read(anna)).body).toEqual({ username: "Anna_99", avatar: null, nickname: null });
    expect((await read(ben)).body).toEqual({ username: "Ben_1", avatar: "owl", nickname: "Benny" });
  });
});
