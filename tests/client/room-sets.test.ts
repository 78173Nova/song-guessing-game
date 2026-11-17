import { describe, expect, it } from "vitest";
import type { RoomState, SummaryItem } from "@/lib/client/room-api";
import { initialRoomView, roomReducer, roomScreen, type RoomAction, type RoomView } from "@/lib/client/room-game";

// Sets (issue #34): after the last round of a set each device shows the player's set summary for 10 s, then the
// standings for 5 s, then "Next round starting…" until the next set starts. After the last set: the final
// standings, then the full summary, which stays. No browser, no network: the local clock is a number we pass in.

const T0 = Date.parse("2026-11-15T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const OPTIONS = ["Song A", "Song B", "Song C", "Song D"];

const item = (round: number, set: number, correct: boolean): SummaryItem => ({
  round,
  set,
  title: `Title ${round}`,
  artist: `Artist ${round}`,
  storeUrl: `https://music.example.com/${round}`,
  correct,
  points: correct ? 100 : 0,
});

const STANDINGS = [
  { rank: 1, nickname: "Ben", score: 300 },
  { rank: 2, nickname: "Anna", score: 100 },
];

// 2 sets of 3 songs. Round `number` closed at T0; the next round starts 23 s later (end of a set) or 8 s later.
function closed(number: number, summary: SummaryItem[], status: "playing" | "finished" = "playing"): RoomState {
  const nextStartsAt = T0 + (number % 3 === 0 ? 23000 : 8000);
  return {
    code: "482913",
    status,
    role: "player",
    players: ["Anna", "Ben"],
    answered: [],
    settings: { type: "multiplayer", mode: "title", genres: "any", decades: "any", songsPerSet: 3, sets: 2 },
    totalRounds: 6,
    serverNow: iso(T0),
    previewUrls: [],
    round: {
      number,
      status: "closed",
      startsAt: iso(T0 - 15000),
      endsAt: iso(T0),
      options: OPTIONS,
      questionType: "title",
      secondsLeft: 0,
      answeredCount: 2,
      correctOption: 0,
      song: { title: `Title ${number}`, artist: `Artist ${number}`, artworkUrl: null, storeUrl: null },
    },
    nextRound:
      status === "finished"
        ? null
        : { number: number + 1, startsAt: iso(nextStartsAt), options: ["W", "X", "Y", "Z"], questionType: "title" },
    me: { nickname: "Ben", score: 300, rank: 1, answer: 0, correct: true, points: 100, summary },
    standings: STANDINGS,
  };
}

const SET_1 = [item(1, 1, true), item(2, 1, false), item(3, 1, true)];
const ALL = [...SET_1, item(4, 2, true), item(5, 2, false), item(6, 2, false)];

const polled = (state: RoomState, at = T0): RoomAction => ({ type: "polled", request: 1, state, receivedAt: at });
const run = (...actions: RoomAction[]): RoomView => actions.reduce(roomReducer, initialRoomView);
const S = 1000;

describe("roomScreen – the break after a set", () => {
  it("shows the result, the set summary for 10 s, the standings for 5 s, then 'Next round starting…' and the next set", () => {
    const view = run(polled(closed(3, SET_1)));

    expect(roomScreen(view, T0 + 4.9 * S).kind).toBe("result");
    expect(roomScreen(view, T0 + 5 * S)).toEqual({ kind: "set-summary", set: 1, songs: SET_1 });
    expect(roomScreen(view, T0 + 14.9 * S).kind).toBe("set-summary");
    expect(roomScreen(view, T0 + 15 * S)).toEqual({ kind: "set-standings", set: 1, standings: STANDINGS, me: "Ben" });
    expect(roomScreen(view, T0 + 19.9 * S).kind).toBe("set-standings");
    expect(roomScreen(view, T0 + 20 * S)).toEqual({ kind: "next-starting", number: 4 });
    expect(roomScreen(view, T0 + 23 * S)).toMatchObject({ kind: "round", number: 4 });
  });

  it("shows only the songs of the set that just ended", () => {
    const view = run(polled(closed(6, ALL, "playing")));
    // Round 6 ends set 2 (pretend there were 3 sets): only rounds 4–6.
    expect(roomScreen(view, T0 + 5 * S)).toEqual({ kind: "set-summary", set: 2, songs: ALL.slice(3) });
  });

  it("'Tap to continue' skips the result, the summary and the standings early", () => {
    let view = run(polled(closed(3, SET_1)), { type: "continued", round: 3 });
    expect(roomScreen(view, T0 + 1 * S).kind).toBe("set-summary");

    view = roomReducer(view, { type: "continued", round: 3, step: "summary" });
    expect(roomScreen(view, T0 + 2 * S).kind).toBe("set-standings");

    view = roomReducer(view, { type: "continued", round: 3, step: "standings" });
    expect(roomScreen(view, T0 + 3 * S)).toEqual({ kind: "next-starting", number: 4 });
    // The next set still starts at the server's time.
    expect(roomScreen(view, T0 + 23 * S)).toMatchObject({ kind: "round", number: 4 });
  });

  it("has no set break after a round inside a set", () => {
    const view = run(polled(closed(2, SET_1.slice(0, 2))));
    expect(roomScreen(view, T0 + 5 * S)).toEqual({ kind: "next-starting", number: 3 });
  });
});

describe("roomScreen – the end of the game", () => {
  it("shows the result, the final standings for 5 s, then the full summary of every song, which stays", () => {
    const view = run(polled(closed(6, ALL, "finished")));

    expect(roomScreen(view, T0 + 4.9 * S).kind).toBe("result");
    expect(roomScreen(view, T0 + 5 * S)).toEqual({ kind: "final", standings: STANDINGS, me: "Ben" });
    expect(roomScreen(view, T0 + 10 * S)).toEqual({ kind: "final-summary", songs: ALL, score: 300 });
    expect(roomScreen(view, T0 + 60 * 60 * S).kind).toBe("final-summary");
  });

  it("'Tap to continue' on the final standings opens the full summary at once", () => {
    const view = run(polled(closed(6, ALL, "finished")), { type: "continued", round: 6 }, {
      type: "continued",
      round: 6,
      step: "standings",
    });
    expect(roomScreen(view, T0 + 1 * S).kind).toBe("final-summary");
  });
});
