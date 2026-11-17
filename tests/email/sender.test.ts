import { afterEach, describe, expect, it, vi } from "vitest";
import { BREVO_URL, sendWithBrevo } from "@/lib/email/brevo";
import { appUrl } from "@/lib/email/messages";
import { getEmailSender } from "@/lib/email/sender";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// These tests never call the real Brevo API (CLAUDE.md rule 8): `fetch` is replaced by a fake (issue #25).

const email = { to: "anna@example.com", subject: "Confirm your email", text: "Hi,\n\nhttps://site.example/verify" };
const settings = { apiKey: "test-key", from: "team@example.com" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendWithBrevo", () => {
  it("sends the email to Brevo's transactional email endpoint and returns ok", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response('{"messageId":"<1@x>"}', { status: 201 }));

    expect(await sendWithBrevo(email, { ...settings, fetchFn })).toEqual({ ok: true });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(BREVO_URL);
    expect(BREVO_URL).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("api-key")).toBe("test-key");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      sender: { email: "team@example.com", name: "Song Guessing Game" },
      to: [{ email: "anna@example.com" }],
      subject: "Confirm your email",
      textContent: "Hi,\n\nhttps://site.example/verify",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns not ok for error codes 400, 401 and 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [400, 401, 500]) {
      const fetchFn = vi.fn(async () => new Response('{"code":"error"}', { status }));
      expect(await sendWithBrevo(email, { ...settings, fetchFn }), String(status)).toEqual({ ok: false });
    }
  });

  it("returns not ok when Brevo does not answer in time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Never answers – only gives up when the request is aborted.
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    expect(await sendWithBrevo(email, { ...settings, fetchFn, timeoutMs: 20 })).toEqual({ ok: false });
  });

  it("returns not ok on a network error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await sendWithBrevo(email, { ...settings, fetchFn })).toEqual({ ok: false });
  });

  it("never writes the API key to the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    await sendWithBrevo(email, { ...settings, fetchFn });
    expect(JSON.stringify(log.mock.calls)).not.toContain("test-key");
  });
});

describe("getEmailSender", () => {
  it("sends through Brevo when BREVO_API_KEY and EMAIL_FROM are set", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response("{}", { status: 201 }));
    const print = vi.spyOn(console, "log").mockImplementation(() => {});

    const send = getEmailSender({ BREVO_API_KEY: "test-key", EMAIL_FROM: "team@example.com" }, fetchFn);

    expect(await send(email)).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(BREVO_URL);
    expect(print).not.toHaveBeenCalled();
  });

  it("accepts EMAIL_FROM as 'Name <address>' and sends the name and address separately", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response("{}", { status: 201 }));

    const send = getEmailSender({ BREVO_API_KEY: "test-key", EMAIL_FROM: "SongSnap <team@example.com>" }, fetchFn);

    expect(await send(email)).toEqual({ ok: true });
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).sender).toEqual({ email: "team@example.com", name: "SongSnap" });
  });

  it("accepts 'Name<address>' without a space", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response("{}", { status: 201 }));

    const send = getEmailSender({ BREVO_API_KEY: "test-key", EMAIL_FROM: "SongSnap<team@example.com>" }, fetchFn);

    await send(email);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).sender).toEqual({ email: "team@example.com", name: "SongSnap" });
  });

  it("keeps the default sender name when EMAIL_FROM is only an address", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response("{}", { status: 201 }));

    const send = getEmailSender({ BREVO_API_KEY: "test-key", EMAIL_FROM: " team@example.com " }, fetchFn);

    await send(email);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).sender).toEqual({
      email: "team@example.com",
      name: "Song Guessing Game",
    });
  });

  it("keeps the default sender name for '<address>' with an empty name", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response("{}", { status: 201 }));

    const send = getEmailSender({ BREVO_API_KEY: "test-key", EMAIL_FROM: "<team@example.com>" }, fetchFn);

    await send(email);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).sender.name).toBe("Song Guessing Game");
  });

  it("fails with an error in the log, and never calls Brevo, when EMAIL_FROM is malformed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const from of ["SongSnap <team@example.com", "SongSnap <>", "SongSnap", "team@example.com>"]) {
      const fetchFn = vi.fn(async () => new Response("{}", { status: 201 }));
      const send = getEmailSender({ BREVO_API_KEY: "test-key", EMAIL_FROM: from }, fetchFn);

      expect(await send(email), from).toEqual({ ok: false });
      expect(fetchFn, from).not.toHaveBeenCalled();
      expect(String(error.mock.lastCall?.[0]), from).toContain("EMAIL_FROM");
    }
  });

  it("prints the email to the terminal without a key in local development", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 201 }));
    const print = vi.spyOn(console, "log").mockImplementation(() => {});

    const send = getEmailSender({}, fetchFn);

    expect(await send(email)).toEqual({ ok: true });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledTimes(1);
    expect(String(print.mock.calls[0][0])).toContain("https://site.example/verify");
  });

  it("fails with an error in the log, and prints nothing, without a key on Vercel", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 201 }));
    const print = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const send = getEmailSender({ VERCEL: "1", EMAIL_FROM: "team@example.com" }, fetchFn);

    expect(await send(email)).toEqual({ ok: false });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toContain("BREVO_API_KEY");
  });

  it("fails with an error in the log when a key is set but EMAIL_FROM is missing", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 201 }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const send = getEmailSender({ BREVO_API_KEY: "test-key" }, fetchFn);

    expect(await send(email)).toEqual({ ok: false });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toContain("EMAIL_FROM");
  });
});

describe("appUrl – where links in emails point", () => {
  it("uses APP_URL first, without a trailing slash", () => {
    expect(appUrl({ APP_URL: "https://game.example/", VERCEL_URL: "preview.vercel.app" })).toBe("https://game.example");
  });

  it("uses Vercel's VERCEL_URL when APP_URL is not set", () => {
    expect(appUrl({ VERCEL_URL: "preview.vercel.app" })).toBe("https://preview.vercel.app");
  });

  it("falls back to http://localhost:3000", () => {
    expect(appUrl({})).toBe("http://localhost:3000");
  });
});
