import { describe, expect, it } from "vitest";
import type { RoomState, SummaryItem } from "@/lib/client/room-api";
import { initialRoomView, roomReducer, roomScreen, type RoomAction, type RoomView } from "@/lib/client/room-game";

// The standings after each round: a Multiplayer game that started with 3 or more players shows them after the
// result, instead of "Next round starting…", until the next round starts. The time between rounds stays the same
// (8 s). No browser, no network: the local clock is a number we pass in.

const T0 = Date.parse("2026-11-15T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const OPTIONS = ["Song A", "Song B", "Song C", "Song D"];
const S = 1000;

const STANDINGS = [
  { rank: 1, nickname: "Ben", score: 300 },
  { rank: 2, nickname: "Anna", score: 100 },
  { rank: 3, nickname: "Cleo", score: 0 },
];

const item = (round: number): SummaryItem => ({
  round,
  set: 1,
  title: `Title ${round}`,
  artist: `Artist ${round}`,
  storeUrl: null,
  correct: true,
  points: 100,
});

type Game = { type?: "multiplayer" | "duel"; startingPlayers?: number; status?: "playing" | "finished" };

// 1 set of 5 songs. Round `number` closed at T0; the next round starts 8 s later.
function closed(number: number, { type = "multiplayer", startingPlayers = 3, status = "playing" }: Game = {}): RoomState {
  return {
    code: "482913",
    status,
    role: "player",
    players: ["Anna", "Ben", "Cleo"],
    answered: [],
    settings: { type, mode: "title", genres: "any", decades: "any", songsPerSet: 5, sets: 1 },
    startingPlayers,
    totalRounds: 5,
    serverNow: iso(T0),
    previewUrls: [],
    round: {
      number,
      status: "closed",
      startsAt: iso(T0 - 15 * S),
      endsAt: iso(T0),
      options: OPTIONS,
      questionType: "title",
      secondsLeft: 0,
      answeredCount: 3,
      correctOption: 0,
      song: { title: `Title ${number}`, artist: `Artist ${number}`, artworkUrl: null, storeUrl: null },
    },
    nextRound:
      status === "finished"
        ? null
        : { number: number + 1, startsAt: iso(T0 + 8 * S), options: ["W", "X", "Y", "Z"], questionType: "title" },
    me: {
      nickname: "Ben",
      score: 300,
      rank: 1,
      answer: 0,
      correct: true,
      points: 100,
      summary: [1, 2, 3, 4, 5].slice(0, number).map(item),
    },
    standings: STANDINGS,
  };
}

const polled = (state: RoomState, at = T0): RoomAction => ({ type: "polled", request: 1, state, receivedAt: at });
const run = (...actions: RoomAction[]): RoomView => actions.reduce(roomReducer, initialRoomView);

describe("roomScreen – the standings after each round", () => {
  it("shows the result for 5 s, then the standings with a countdown until the next round starts on time", () => {
    const view = run(polled(closed(2)));

    expect(roomScreen(view, T0 + 4.9 * S).kind).toBe("result");
    expect(roomScreen(view, T0 + 5 * S)).toEqual({
      kind: "round-standings",
      number: 2,
      standings: STANDINGS,
      me: "Ben",
      secondsToNext: 3,
    });
    expect(roomScreen(view, T0 + 7.5 * S)).toMatchObject({ kind: "round-standings", secondsToNext: 1 });
    expect(roomScreen(view, T0 + 8 * S)).toMatchObject({ kind: "round", number: 3 });
  });

  it("'Tap to continue' skips the result and then the standings early, but the next round still starts on time", () => {
    let view = run(polled(closed(2)), { type: "continued", round: 2 });
    expect(roomScreen(view, T0 + 1 * S)).toMatchObject({ kind: "round-standings", number: 2, secondsToNext: 7 });

    view = roomReducer(view, { type: "continued", round: 2, step: "standings" });
    expect(roomScreen(view, T0 + 2 * S)).toEqual({ kind: "next-starting", number: 3 });
    expect(roomScreen(view, T0 + 7.9 * S).kind).toBe("next-starting");
    expect(roomScreen(view, T0 + 8 * S)).toMatchObject({ kind: "round", number: 3 });
  });

  it("goes straight from the result to 'Next round starting…' in a duel: a Duel room, or Multiplayer started with 2", () => {
    for (const game of [{ type: "duel", startingPlayers: 2 }, { type: "multiplayer", startingPlayers: 2 }] as Game[]) {
      const view = run(polled(closed(2, game)));
      expect(roomScreen(view, T0 + 5 * S)).toEqual({ kind: "next-starting", number: 3 });
    }
  });

  it("keeps the break after the last round of a set: set summary, set standings, then no extra round standings", () => {
    // 2 sets of 3 songs: round 3 ends set 1, and the next set starts 23 s after the close.
    const endOfSet: RoomState = {
      ...closed(3),
      settings: { type: "multiplayer", mode: "title", genres: "any", decades: "any", songsPerSet: 3, sets: 2 },
      totalRounds: 6,
      nextRound: { number: 4, startsAt: iso(T0 + 23 * S), options: ["W", "X", "Y", "Z"], questionType: "title" },
    };
    const view = run(polled(endOfSet));

    expect(roomScreen(view, T0 + 5 * S).kind).toBe("set-summary");
    expect(roomScreen(view, T0 + 15 * S).kind).toBe("set-standings");
    expect(roomScreen(view, T0 + 20 * S)).toEqual({ kind: "next-starting", number: 4 });
  });

  it("goes from the result of the last round straight to the final standings", () => {
    const view = run(polled(closed(5, { status: "finished" })));

    expect(roomScreen(view, T0 + 4.9 * S).kind).toBe("result");
    expect(roomScreen(view, T0 + 5 * S)).toEqual({ kind: "final", standings: STANDINGS, me: "Ben" });
  });
});
