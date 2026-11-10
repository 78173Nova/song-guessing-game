import { describe, expect, it, vi } from "vitest";
import { checkPreviewUrl } from "@/lib/music/check";

// Never calls Apple: fetch is a fake.
const URL = "https://audio.example.com/clip.m4a";

describe("checkPreviewUrl", () => {
  it("returns ok for 200 and 206 and asks only for the first bytes", async () => {
    for (const status of [200, 206]) {
      const fetchFn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("ab", { status }));
      expect(await checkPreviewUrl(URL, { fetchFn }), String(status)).toBe("ok");
      expect(new Headers(fetchFn.mock.calls[0][1]?.headers).get("Range")).toBe("bytes=0-1");
    }
  });

  it("returns broken when Apple says the clip does not exist (403, 404)", async () => {
    for (const status of [403, 404]) {
      const fetchFn = vi.fn(async () => new Response("no", { status }));
      expect(await checkPreviewUrl(URL, { fetchFn }), String(status)).toBe("broken");
    }
  });

  it("returns unknown for a timeout, a network error or a server error – never throws", async () => {
    const hangs = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    expect(await checkPreviewUrl(URL, { fetchFn: hangs, timeoutMs: 20 })).toBe("unknown");

    const fails = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await checkPreviewUrl(URL, { fetchFn: fails })).toBe("unknown");

    expect(await checkPreviewUrl(URL, { fetchFn: vi.fn(async () => new Response("", { status: 500 })) })).toBe("unknown");
  });
});
