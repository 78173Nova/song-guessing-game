// The parts of the load test (scripts/load-test.ts) that need no network: reading the command options and
// turning the measured request times into a report. Tested in tests/scripts/load-test.test.ts.

export const DEFAULT_URL = "https://song-guessing-game-tawny.vercel.app";
export const DEFAULT_BOTS = 10;
// A Multiplayer room has 25 seats (MAX_PLAYERS_BY_TYPE) and the room creator takes one.
export const MAX_BOTS = 24;

export type LoadTestOptions = { url: string; room: string; bots: number };
export type ParseResult = { ok: true; options: LoadTestOptions } | { ok: false; message: string };

const USAGE = "Usage: npm run load-test -- --room 123456 [--bots 10] [--url https://...]";

// Reads e.g. ["--room", "123456", "--bots", "15"]. Every value is checked, so a typo gives a clear message
// instead of bots that fail one by one.
export function parseLoadTestArgs(argv: string[]): ParseResult {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    if (!["--room", "--bots", "--url"].includes(name)) return fail(`Unknown option ${JSON.stringify(name)}.`);
    if (i + 1 >= argv.length) return fail(`${name} needs a value.`);
    values[name] = argv[i + 1];
  }

  const room = values["--room"];
  if (room === undefined) return fail("--room is missing: create a room on your phone and give its 6-digit code.");
  if (!/^[1-9][0-9]{5}$/.test(room)) return fail("--room must be the 6-digit room code (it never starts with 0).");

  const botsText = values["--bots"] ?? String(DEFAULT_BOTS);
  if (!/^[0-9]+$/.test(botsText) || Number(botsText) < 1 || Number(botsText) > MAX_BOTS) {
    return fail(`--bots must be a whole number between 1 and ${MAX_BOTS}.`);
  }

  const url = (values["--url"] ?? DEFAULT_URL).replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+/.test(url)) return fail("--url must start with http:// or https://.");

  return { ok: true, options: { url, room, bots: Number(botsText) } };
}

const fail = (message: string): ParseResult => ({ ok: false, message: `${message}\n${USAGE}` });

// One measured request: what it was (join, poll, answer, leave), how long it took and whether it worked.
export type Sample = { kind: string; ms: number; ok: boolean };
export type ReportRow = {
  kind: string;
  count: number;
  failed: number;
  medianMs: number;
  p95Ms: number;
  slowestMs: number;
};

// One row per kind of request, in the order the kinds first appeared. Failed requests count in the times too:
// a slow failure is exactly what the test should show.
export function summarize(samples: Sample[]): ReportRow[] {
  const byKind = new Map<string, Sample[]>();
  for (const sample of samples) byKind.set(sample.kind, [...(byKind.get(sample.kind) ?? []), sample]);
  return [...byKind].map(([kind, list]) => {
    const times = list.map((sample) => sample.ms).sort((a, b) => a - b);
    return {
      kind,
      count: list.length,
      failed: list.filter((sample) => !sample.ok).length,
      medianMs: percentile(times, 50),
      p95Ms: percentile(times, 95),
      slowestMs: times[times.length - 1],
    };
  });
}

// "Nearest rank": the time that p percent of the requests were as fast as or faster than.
function percentile(sortedTimes: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sortedTimes.length);
  return sortedTimes[Math.max(0, rank - 1)];
}
