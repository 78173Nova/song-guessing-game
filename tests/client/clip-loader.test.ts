import { describe, expect, it, vi } from "vitest";
import { canPlayPreviews, MAX_REPLACEMENTS, prepareClip } from "@/lib/client/clip-loader";

// `load` and `replace` are fakes: no browser, no network.
describe("canPlayPreviews", () => {
  it("is false only when the browser says it cannot play AAC at all", () => {
    expect(canPlayPreviews(() => "")).toBe(false);
    expect(canPlayPreviews(() => "maybe")).toBe(true);
    expect(canPlayPreviews(() => "probably")).toBe(true);
  });
});

describe("prepareClip", () => {
  it("returns the original address when it loads on the first try, without swapping", async () => {
    const load = vi.fn(async () => true);
    const replace = vi.fn(async () => "https://new.example.com/x.m4a");
    expect(await prepareClip("https://a.example.com/1.m4a", load, replace)).toEqual({ ok: true, url: "https://a.example.com/1.m4a" });
    expect(load).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("tries the same address once more after a failure", async () => {
    const load = vi.fn<(url: string) => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const replace = vi.fn(async () => "https://new.example.com/x.m4a");
    expect(await prepareClip("https://a.example.com/1.m4a", load, replace)).toEqual({ ok: true, url: "https://a.example.com/1.m4a" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("swaps the song after two failures and uses the new clip", async () => {
    const load = vi.fn(async (url: string) => url.includes("new"));
    const replace = vi.fn(async () => "https://new.example.com/x.m4a");
    expect(await prepareClip("https://a.example.com/1.m4a", load, replace)).toEqual({ ok: true, url: "https://new.example.com/x.m4a" });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("gives up after 3 swaps, or right away when the server has no replacement song", async () => {
    let n = 0;
    const replace = vi.fn(async () => `https://new.example.com/${++n}.m4a`);
    expect(await prepareClip("https://a.example.com/1.m4a", async () => false, replace)).toEqual({ ok: false });
    expect(replace).toHaveBeenCalledTimes(MAX_REPLACEMENTS);
    expect(MAX_REPLACEMENTS).toBe(3);

    const none = vi.fn(async () => null);
    expect(await prepareClip("https://a.example.com/1.m4a", async () => false, none)).toEqual({ ok: false });
    expect(none).toHaveBeenCalledTimes(1);
  });

  it("never tries one address more than twice", async () => {
    let n = 0;
    const tries = new Map<string, number>();
    const load = vi.fn(async (url: string) => {
      tries.set(url, (tries.get(url) ?? 0) + 1);
      return false;
    });
    await prepareClip("https://a.example.com/1.m4a", load, async () => `https://new.example.com/${++n}.m4a`);
    expect(tries.size).toBe(1 + MAX_REPLACEMENTS);
    for (const count of tries.values()) expect(count).toBe(2);
  });
});
