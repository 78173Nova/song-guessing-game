import { describe, expect, it } from "vitest";
import type { RoomState } from "@/lib/client/room-api";
import { initialRoomView, roomReducer, roomScreen, type RoomAction, type RoomView } from "@/lib/client/room-game";

// The screens of a server-paced room game (issue #33), worked out from the polled state and the local clock.
// No browser, no network: the "local clock" is a number we pass in.

const T0 = Date.parse("2026-11-15T12:00:00.000Z"); // the server's clock when round 1 is scheduled
const iso = (ms: number) => new Date(ms).toISOString();
const OPTIONS = ["Song A", "Song B", "Song C", "Song D"];
const URLS = [1, 2, 3, 4, 5].map((n) => `https://audio.example.com/${n}.m4a`);

const base: RoomState = {
  code: "482913",
  status: "lobby",
  role: "player",
  players: ["Anna", "Ben"],
  answered: [],
  totalRounds: 5,
  serverNow: iso(T0),
  previewUrls: null,
  round: null,
  nextRound: null,
  me: { nickname: "Ben", score: 0, rank: 1, answer: null, correct: null, points: null },
  standings: [
    { rank: 1, nickname: "Anna", score: 0 },
    { rank: 1, nickname: "Ben", score: 0 },
  ],
};

// Round 1 is scheduled to start 5 s after T0.
const scheduled: RoomState = {
  ...base,
  status: "playing",
  previewUrls: URLS,
  nextRound: { number: 1, startsAt: iso(T0 + 5000), options: OPTIONS },
};

const openRound = (serverNow: number, answeredCount = 0): RoomState => ({
  ...scheduled,
  serverNow: iso(serverNow),
  nextRound: null,
  round: {
    number: 1,
    status: "open",
    startsAt: iso(T0 + 5000),
    endsAt: iso(T0 + 20000),
    options: OPTIONS,
    secondsLeft: 15,
    answeredCount,
  },
});

// Round 1 closed at T0 + 9 s (everyone answered); round 2 starts 8 s later.
const closedRound = (serverNow: number, status: "playing" | "finished" = "playing"): RoomState => ({
  ...scheduled,
  status,
  serverNow: iso(serverNow),
  nextRound: status === "finished" ? null : { number: 2, startsAt: iso(T0 + 17000), options: ["W", "X", "Y", "Z"] },
  round: {
    number: 1,
    status: "closed",
    startsAt: iso(T0 + 5000),
    endsAt: iso(T0 + 20000),
    options: OPTIONS,
    secondsLeft: 0,
    answeredCount: 2,
    correctOption: 2,
    song: { title: "Song C", artist: "Artist C", artworkUrl: null, storeUrl: null },
  },
  me: { nickname: "Ben", score: 140, rank: 1, answer: 2, correct: true, points: 140 },
  standings: [
    { rank: 1, nickname: "Ben", score: 140 },
    { rank: 2, nickname: "Anna", score: 0 },
  ],
});

// A reply to state request number `request`, received at local time `at`. In these tests the local clock and
// the server clock are the same unless a test says otherwise.
const polled = (request: number, state: RoomState, at = Date.parse(state.serverNow)): RoomAction => ({
  type: "polled",
  request,
  state,
  receivedAt: at,
});

const run = (...actions: RoomAction[]): RoomView => actions.reduce(roomReducer, initialRoomView);

describe("roomScreen – a server-paced round", () => {
  it("shows a loading screen before the first reply and the lobby while in the lobby", () => {
    expect(roomScreen(initialRoomView, T0)).toEqual({ kind: "loading" });
    expect(roomScreen(run(polled(1, base)), T0)).toEqual({ kind: "lobby" });
  });

  it("counts down to round 1 and switches to the round exactly at the server's start time, without a new reply", () => {
    const view = run(polled(1, scheduled));

    expect(roomScreen(view, T0 + 1000)).toEqual({ kind: "get-ready", number: 1, secondsToStart: 4 });
    expect(roomScreen(view, T0 + 4999)).toMatchObject({ kind: "get-ready", secondsToStart: 1 });
    expect(roomScreen(view, T0 + 5000)).toEqual({
      kind: "round",
      number: 1,
      totalRounds: 5,
      options: OPTIONS,
      startsAt: T0 + 5000,
      secondsLeft: 15,
      answer: null,
    });
  });

  it("starts at the server's start time even when this device's clock is off", () => {
    // This device's clock is 30 s behind the server: it received the reply at local T0 - 30 s.
    const view = run(polled(1, scheduled, T0 - 30000));

    expect(roomScreen(view, T0 - 30000 + 4999).kind).toBe("get-ready");
    // `startsAt` is in local time, so the clip can start then.
    expect(roomScreen(view, T0 - 30000 + 5000)).toMatchObject({ kind: "round", startsAt: T0 - 30000 + 5000 });
  });

  it("counts the seconds left from the start time, and keeps the player's tapped answer", () => {
    const view = run(polled(1, openRound(T0 + 6000)), { type: "answered", round: 1, option: 3 });

    expect(roomScreen(view, T0 + 8200)).toMatchObject({ kind: "round", secondsLeft: 12, answer: 3 });
    expect(roomScreen(view, T0 + 21000)).toMatchObject({ kind: "round", secondsLeft: 0 });
  });

  it("forgets a tapped answer the server refused, so the player can tap again", () => {
    const view = run(
      polled(1, openRound(T0 + 6000)),
      { type: "answered", round: 1, option: 3 },
      { type: "answer-refused", round: 1 },
    );
    expect(roomScreen(view, T0 + 7000)).toMatchObject({ kind: "round", answer: null });
  });

  it("shows the server's record of the answer after a reload", () => {
    const state = openRound(T0 + 6000);
    const view = run(polled(1, { ...state, me: { ...state.me, answer: 1 } }));
    expect(roomScreen(view, T0 + 7000)).toMatchObject({ kind: "round", answer: 1 });
  });
});

describe("roomScreen – round → result → next round → final standings", () => {
  it("shows the result for 5 s from when this device first sees it, then 'Next round starting…', then round 2", () => {
    const view = run(polled(1, openRound(T0 + 6000)), polled(2, closedRound(T0 + 9500)));

    expect(roomScreen(view, T0 + 9500)).toEqual({
      kind: "result",
      number: 1,
      options: OPTIONS,
      correctOption: 2,
      song: { title: "Song C", artist: "Artist C", artworkUrl: null, storeUrl: null },
      answer: 2,
      correct: true,
      points: 140,
      score: 140,
    });
    // A later reply with the same closed round does not restart the 5 seconds.
    const later = roomReducer(view, polled(3, closedRound(T0 + 11000)));
    expect(roomScreen(later, T0 + 14499).kind).toBe("result");
    expect(roomScreen(later, T0 + 14500)).toEqual({ kind: "next-starting", number: 2 });
    expect(roomScreen(later, T0 + 17000)).toMatchObject({ kind: "round", number: 2, options: ["W", "X", "Y", "Z"], secondsLeft: 15 });
  });

  it("'Tap to continue' skips this player's result, but the next round still starts at the server's time", () => {
    const view = run(polled(1, closedRound(T0 + 9500)), { type: "continued", round: 1 });

    expect(roomScreen(view, T0 + 10000)).toEqual({ kind: "next-starting", number: 2 });
    expect(roomScreen(view, T0 + 16999).kind).toBe("next-starting");
    expect(roomScreen(view, T0 + 17000)).toMatchObject({ kind: "round", number: 2 });
  });

  it("shows a missed round as wrong with 0 points", () => {
    const state = closedRound(T0 + 9500);
    const view = run(polled(1, { ...state, me: { ...state.me, answer: null, correct: false, points: 0, score: 0 } }));
    expect(roomScreen(view, T0 + 9500)).toMatchObject({ kind: "result", answer: null, correct: false, points: 0 });
  });

  it("after the last round: the result first, then the final standings with shared ranks", () => {
    const finished: RoomState = {
      ...closedRound(T0 + 9500, "finished"),
      round: { ...closedRound(T0).round!, number: 5 },
      standings: [
        { rank: 1, nickname: "Anna", score: 700 },
        { rank: 1, nickname: "Ben", score: 700 },
        { rank: 3, nickname: "Cleo", score: 0 },
      ],
    };
    const view = run(polled(1, finished));

    expect(roomScreen(view, T0 + 9500).kind).toBe("result");
    expect(roomScreen(view, T0 + 14500)).toEqual({ kind: "final", standings: finished.standings, me: "Ben" });
    expect(roomScreen(roomReducer(view, { type: "continued", round: 5 }), T0 + 9600).kind).toBe("final");
  });
});

describe("roomReducer – late replies", () => {
  it("ignores a reply to an older request that arrives after a newer one", () => {
    const view = run(polled(2, closedRound(T0 + 9500)), polled(1, openRound(T0 + 6000)));

    expect(view.latest).toEqual(closedRound(T0 + 9500));
    expect(roomScreen(view, T0 + 9600).kind).toBe("result");
  });

  it("never goes back to the lobby once the game has started", () => {
    const view = run(polled(1, scheduled), polled(2, base));
    expect(roomScreen(view, T0 + 1000).kind).toBe("get-ready");
  });

  it("ignores an answer tap for a round that is not on screen, and a second tap", () => {
    const view = run(
      polled(1, openRound(T0 + 6000)),
      { type: "answered", round: 2, option: 0 },
      { type: "answered", round: 1, option: 3 },
      { type: "answered", round: 1, option: 1 },
    );
    expect(roomScreen(view, T0 + 7000)).toMatchObject({ kind: "round", number: 1, answer: 3 });
  });
});
