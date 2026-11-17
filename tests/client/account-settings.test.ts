import { describe, expect, it, vi } from "vitest";
import { apiAccountSettings, apiSaveAccountSettings } from "@/lib/client/account-api";
import { nicknameScreenStart } from "@/lib/client/nickname-screen";

function reply(status: number, body: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

const ANNA = { username: "Anna_99", avatar: "fox", nickname: "Annie" };

describe("account settings calls from the browser (issue #44)", () => {
  it("reads the settings of the logged-in account", async () => {
    const fetchFn = reply(200, ANNA);
    expect(await apiAccountSettings(fetchFn)).toEqual(ANNA);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/accounts/settings");
  });

  it("gives null for a guest (401), a server error or no connection", async () => {
    expect(await apiAccountSettings(reply(401, { error: "log-in-needed", message: "Please log in first." }))).toBeNull();
    expect(await apiAccountSettings(reply(500, "oops"))).toBeNull();
    expect(await apiAccountSettings(vi.fn(async () => Promise.reject(new Error("offline"))))).toBeNull();
  });

  it("saves avatar and usual nickname as JSON and passes on a refusal", async () => {
    const fetchFn = reply(200, ANNA);
    expect(await apiSaveAccountSettings({ avatar: "fox", nickname: "Annie" }, fetchFn)).toEqual({ ok: true, data: ANNA });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/accounts/settings");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ avatar: "fox", nickname: "Annie" });

    const refused = reply(400, { error: "invalid-nickname", message: "Please choose a nickname with 1 to 20 characters." });
    expect(await apiSaveAccountSettings({ avatar: "fox", nickname: "x" }, refused)).toEqual({
      ok: false,
      message: "Please choose a nickname with 1 to 20 characters.",
    });
  });
});

describe("what the nickname screen starts with", () => {
  const first = () => 0; // the random pick lands on the first avatar
  const last = () => 0.999;

  it("a guest: empty nickname, an avatar picked at random, and the avatar choice shown", () => {
    expect(nicknameScreenStart(null, first)).toEqual({ nickname: "", avatar: "fox", askAvatar: true });
    expect(nicknameScreenStart(null, last)).toEqual({ nickname: "", avatar: "note", askAvatar: true });
  });

  it("an account holder with saved settings: both filled in, no avatar question", () => {
    expect(nicknameScreenStart({ username: "Anna_99", avatar: "owl", nickname: "Annie" }, first)).toEqual({
      nickname: "Annie",
      avatar: "owl",
      askAvatar: false,
    });
  });

  it("an account holder without a usual nickname gets the username; without an avatar is asked once", () => {
    expect(nicknameScreenStart({ username: "Anna_99", avatar: null, nickname: null }, last)).toEqual({
      nickname: "Anna_99",
      avatar: "note",
      askAvatar: true,
    });
  });
});
