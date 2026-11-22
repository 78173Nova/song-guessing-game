// Load test for a Multiplayer room: bots join a room someone created on the real site and play like phones.
//   npm run load-test -- --room 123456 --bots 15
// Each bot asks for the room state once a second (like components/Room.tsx), answers each round with a random
// option at a random moment, and leaves when the game is over. Ctrl+C stops the bots early (they leave too).
// At the end it prints how many requests were sent, how many failed and how long they took.
// It only sends the same requests a phone sends, so it needs no secrets and never touches the database itself.
import { parseLoadTestArgs, summarize, type Sample } from "./load-test-plan.ts";

const POLL_MS = 1000; // the same as POLL_MS in components/Room.tsx
const REQUEST_TIMEOUT_MS = 10_000;
// A bot answers between 1 and 12 seconds after the round starts (rounds last 15 s).
const ANSWER_DELAY_MS = { min: 1000, max: 12_000 };
const AVATARS = ["fox", "cat", "dog", "owl", "panda", "frog", "lion", "penguin", "octopus", "unicorn"];

type RoundInfo = { number: number; startsAt: string; options: string[] };
type State = {
  status: "lobby" | "playing" | "finished";
  serverNow: string;
  players: string[];
  round: (RoundInfo & { status: "open" | "closed" }) | null;
  nextRound: RoundInfo | null;
  me: { answer: number | null };
};

const parsed = parseLoadTestArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.message);
  process.exit(1);
}
const { url, room, bots } = parsed.options;

const samples: Sample[] = [];
const failures = new Map<string, number>(); // e.g. "poll: HTTP 500" -> 3
let stopping = false;

// Sends one request, measures it and records the result. Never throws: a failed request is a result too.
async function send(kind: string, path: string, token: string | null, body?: unknown) {
  const started = performance.now();
  let status = 0;
  let data: Record<string, unknown> = {};
  try {
    const response = await fetch(`${url}${path}`, {
      method: kind === "poll" ? "GET" : "POST",
      headers: {
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = response.status;
    data = await response.json().catch(() => ({}));
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network error";
    failures.set(`${kind}: ${reason}`, (failures.get(`${kind}: ${reason}`) ?? 0) + 1);
  }
  const ok = status >= 200 && status < 300;
  samples.push({ kind, ms: Math.round(performance.now() - started), ok });
  if (!ok && status !== 0) {
    const key = `${kind}: HTTP ${status}${typeof data.message === "string" ? ` (${data.message})` : ""}`;
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }
  return { ok, status, data };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

async function runBot(index: number) {
  const nickname = `Bot ${index}`;
  const joined = await send("join", `/api/rooms/${room}/join`, null, {
    nickname,
    avatar: AVATARS[index % AVATARS.length],
  });
  if (!joined.ok) {
    console.log(`${nickname} could not join: ${joined.data.message ?? `HTTP ${joined.status || "no answer"}`}`);
    return;
  }
  const token = String(joined.data.playerToken);
  const planned = new Set<number>(); // rounds this bot has already planned an answer for

  // Real phones do not all poll at the same moment.
  await wait(randomBetween(0, POLL_MS));
  while (!stopping) {
    const polled = await send("poll", `/api/rooms/${room}`, token);
    if (polled.status === 403 || polled.status === 404 || polled.status === 409) {
      console.log(`${nickname} stopped: ${polled.data.message ?? `HTTP ${polled.status}`}`);
      return;
    }
    if (polled.ok) {
      const state = polled.data as unknown as State;
      if (state.status === "finished") break;
      // How far this computer's clock is from the server's, so the answer lands at the planned moment.
      const offset = Date.now() - Date.parse(state.serverNow);
      const open = state.round?.status === "open" && state.me.answer === null ? state.round : null;
      for (const round of [state.nextRound, open]) {
        if (round === null || planned.has(round.number)) continue;
        planned.add(round.number);
        const answerAt = Date.parse(round.startsAt) + offset + randomBetween(ANSWER_DELAY_MS.min, ANSWER_DELAY_MS.max);
        const answer = randomBetween(0, round.options.length - 1);
        setTimeout(() => {
          if (!stopping) void send("answer", `/api/rooms/${room}/answer`, token, { round: round.number, answer });
        }, Math.max(0, answerAt - Date.now()));
      }
    }
    await wait(POLL_MS);
  }
  await send("leave", `/api/rooms/${room}/leave`, token);
}

function printReport() {
  const rows = summarize(samples);
  console.log("\n=== Load test report ===");
  console.log(`${bots} bots, room ${room}, ${url}\n`);
  if (rows.length === 0) {
    console.log("No requests were sent.");
    return;
  }
  console.log("request   count  failed  median   95%   slowest");
  for (const row of rows) {
    console.log(
      `${row.kind.padEnd(8)} ${String(row.count).padStart(6)} ${String(row.failed).padStart(7)} ` +
        `${`${row.medianMs} ms`.padStart(7)} ${`${row.p95Ms} ms`.padStart(7)} ${`${row.slowestMs} ms`.padStart(8)}`,
    );
  }
  if (failures.size > 0) {
    console.log("\nWhat failed:");
    for (const [reason, count] of failures) console.log(`  ${count} × ${reason}`);
  } else {
    console.log("\nNo request failed.");
  }
  console.log("\nRule of thumb: a poll every second feels smooth while the 95% time stays well under 1000 ms.");
}

console.log(`Joining ${bots} bots to room ${room} on ${url} ... (Ctrl+C stops them)`);
const running = Promise.all(Array.from({ length: bots }, (_, i) => runBot(i + 1)));

process.on("SIGINT", () => {
  if (stopping) process.exit(1); // a second Ctrl+C quits at once
  console.log("\nStopping the bots (they leave the room) ...");
  stopping = true;
});

// Status every 10 seconds, so you see that the bots are still working.
const status = setInterval(() => {
  const failed = samples.filter((sample) => !sample.ok).length;
  console.log(`... ${samples.length} requests so far, ${failed} failed`);
}, 10_000);

await running;
clearInterval(status);
printReport();
