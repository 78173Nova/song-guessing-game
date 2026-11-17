import { describe, expect, it, vi } from "vitest";
import { apiChangeEmail, apiChangePassword, apiChangeUsername, apiConfirmEmailChange } from "@/lib/client/account-api";

function reply(status: number, body: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

// The browser's calls for changing the login details (issue #45): each posts JSON to its route and passes on the
// server's reply or message.
describe("login detail calls from the browser", () => {
  it.each([
    ["username", () => apiChangeUsername("Annika_7", fetchFn), "/api/accounts/username", { username: "Annika_7" }],
    [
      "email",
      () => apiChangeEmail({ email: "new@example.org", password: "secret-123" }, fetchFn),
      "/api/accounts/email",
      { email: "new@example.org", password: "secret-123" },
    ],
    [
      "password",
      () => apiChangePassword({ currentPassword: "old-pass-1", newPassword: "new-pass-1" }, fetchFn),
      "/api/accounts/password",
      { currentPassword: "old-pass-1", newPassword: "new-pass-1" },
    ],
    ["confirm", () => apiConfirmEmailChange("tok", fetchFn), "/api/accounts/confirm-email", { token: "tok" }],
  ])("%s: posts the form as JSON and gives back the reply", async (_, call, url, body) => {
    fetchFn = reply(200, { message: "Done" });
    expect(await call()).toEqual({ ok: true, data: { message: "Done" } });
    const [calledUrl, init] = fetchFn.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("passes on the server's message when a change is refused", async () => {
    fetchFn = reply(403, { error: "wrong-password", message: "Your current password is not right." });
    expect(await apiChangePassword({ currentPassword: "x", newPassword: "new-pass-1" }, fetchFn)).toEqual({
      ok: false,
      message: "Your current password is not right.",
    });
  });
});

let fetchFn = reply(200, {});
