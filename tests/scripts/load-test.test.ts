import { describe, expect, it } from "vitest";
import { DEFAULT_URL, parseLoadTestArgs, summarize } from "../../scripts/load-test-plan.ts";

describe("parseLoadTestArgs", () => {
  it("accepts a room code and a number of bots", () => {
    expect(parseLoadTestArgs(["--room", "123456", "--bots", "15"])).toEqual({
      ok: true,
      options: { url: DEFAULT_URL, room: "123456", bots: 15 },
    });
  });

  it("uses 10 bots when --bots is missing", () => {
    const result = parseLoadTestArgs(["--room", "123456"]);
    expect(result.ok && result.options.bots).toBe(10);
  });

  it("accepts 1 and 24 bots (the creator takes the 25th seat)", () => {
    expect(parseLoadTestArgs(["--room", "123456", "--bots", "1"]).ok).toBe(true);
    expect(parseLoadTestArgs(["--room", "123456", "--bots", "24"]).ok).toBe(true);
  });

  it.each(["0", "25", "-3", "2.5", "abc", ""])("rejects %j bots", (bots) => {
    expect(parseLoadTestArgs(["--room", "123456", "--bots", bots]).ok).toBe(false);
  });

  it("rejects a missing room code", () => {
    expect(parseLoadTestArgs(["--bots", "5"]).ok).toBe(false);
  });

  it.each(["12345", "1234567", "012345", "abcdef"])("rejects the room code %j", (room) => {
    expect(parseLoadTestArgs(["--room", room]).ok).toBe(false);
  });

  it("accepts another site and removes a slash at the end", () => {
    const result = parseLoadTestArgs(["--room", "123456", "--url", "http://localhost:3000/"]);
    expect(result.ok && result.options.url).toBe("http://localhost:3000");
  });

  it.each(["ftp://example.com", "example.com", ""])("rejects the url %j", (url) => {
    expect(parseLoadTestArgs(["--room", "123456", "--url", url]).ok).toBe(false);
  });

  it("rejects an unknown option and an option without a value", () => {
    expect(parseLoadTestArgs(["--room", "123456", "--speed", "2"]).ok).toBe(false);
    expect(parseLoadTestArgs(["--room"]).ok).toBe(false);
  });

  it("explains what went wrong", () => {
    const result = parseLoadTestArgs(["--room", "123456", "--bots", "30"]);
    expect(!result.ok && result.message).toMatch(/1 and 24/);
  });
});

describe("summarize", () => {
  it("gives count, median, 95th percentile and slowest time per kind of request", () => {
    // 20 polls taking 10, 20, ..., 200 ms
    const samples = Array.from({ length: 20 }, (_, i) => ({ kind: "poll", ms: (i + 1) * 10, ok: true }));
    expect(summarize(samples)).toEqual([
      { kind: "poll", count: 20, failed: 0, medianMs: 100, p95Ms: 190, slowestMs: 200 },
    ]);
  });

  it("counts failed requests and keeps their times in the statistics", () => {
    const samples = [
      { kind: "answer", ms: 50, ok: true },
      { kind: "answer", ms: 900, ok: false },
      { kind: "answer", ms: 70, ok: true },
    ];
    expect(summarize(samples)).toEqual([
      { kind: "answer", count: 3, failed: 1, medianMs: 70, p95Ms: 900, slowestMs: 900 },
    ]);
  });

  it("keeps the kinds in the order they first appeared", () => {
    const samples = [
      { kind: "join", ms: 5, ok: true },
      { kind: "poll", ms: 5, ok: true },
      { kind: "join", ms: 5, ok: true },
    ];
    expect(summarize(samples).map((row) => row.kind)).toEqual(["join", "poll"]);
  });

  it("returns an empty list when there were no requests", () => {
    expect(summarize([])).toEqual([]);
  });
});
