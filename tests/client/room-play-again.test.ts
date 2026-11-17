import { describe, expect, it } from "vitest";
import type { RoomState } from "@/lib/client/room-api";
import { initialRoomView, roomReducer, roomScreen, type RoomAction, type RoomView } from "@/lib/client/room-game";

// Play again (issue #43) on the device: after the final standings, the full summary shows "Play again" and "Leave"
// with the seconds left to choose; when the room goes back to the lobby for its next game, the page follows it.
// No browser, no network: the local clock is a number we pass in.

const T0 = Date.parse("2026-11-15T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const S = 1000;

// Game 1 has just finished: its last round closed at T0, the vote ends 70 s later.
function finished(chosen: string[] = [], playAgain = true): RoomState {
  return {
    code: "482913",
    status: "finished",
    role: "player",
    players: ["Anna", "Ben"],
    answered: [],
    totalRounds: 3,
    gameNumber: 1,
    playAgain: playAgain ? { endsAt: iso(T0 + 70 * S), chosen } : null,
    serverNow: iso(T0),
    previewUrls: ["a", "b", "c"],
    round: {
      number: 3,
      status: "closed",
      startsAt: iso(T0 - 15 * S),
      endsAt: iso(T0),
      options: ["A", "B", "C", "D"],
      secondsLeft: 0,
      answeredCount: 2,
      correctOption: 0,
      song: { title: "Title 3", artist: "Artist 3", artworkUrl: null, storeUrl: null },
    },
    nextRound: null,
    me: { nickname: "Ben", score: 300, rank: 1, answer: 0, correct: true, points: 100, summary: [] },
    standings: [{ rank: 1, nickname: "Ben", score: 300 }],
  };
}

function lobby(gameNumber: number): RoomState {
  return {
    ...finished(),
    status: "lobby",
    gameNumber,
    playAgain: null,
    previewUrls: null,
    round: null,
    me: { nickname: "Ben", score: 0, rank: 1, answer: null, correct: null, points: null, summary: [] },
  };
}

let request = 0;
const polled = (state: RoomState, at = T0): RoomAction => ({ type: "polled", request: ++request, state, receivedAt: at });
const run = (...actions: RoomAction[]): RoomView => actions.reduce(roomReducer, initialRoomView);

describe("roomScreen – the choice after a game", () => {
  it("offers Play again on the full summary, with the seconds left on the server's clock", () => {
    const view = run(polled(finished()));
    expect(roomScreen(view, T0 + 5 * S).kind).toBe("final"); // the final standings come first
    expect(roomScreen(view, T0 + 10 * S)).toMatchObject({
      kind: "final-summary",
      playAgain: { secondsLeft: 60, chosen: false },
    });
    expect(roomScreen(view, T0 + 69.5 * S)).toMatchObject({ playAgain: { secondsLeft: 1 } });
    expect(roomScreen(view, T0 + 80 * S)).toMatchObject({ playAgain: { secondsLeft: 0 } });
  });

  it("says when this player has chosen Play again", () => {
    const view = run(polled(finished(["Ben"])));
    expect(roomScreen(view, T0 + 10 * S)).toMatchObject({ playAgain: { chosen: true } });
  });

  it("offers nothing after the last game a room may host", () => {
    const view = run(polled(finished([], false)));
    expect(roomScreen(view, T0 + 10 * S)).not.toHaveProperty("playAgain");
  });
});

describe("roomReducer – the next game", () => {
  it("follows the room back to the lobby for its next game and forgets the last game's taps and skips", () => {
    const view = run(
      polled(finished()),
      { type: "continued", round: 3 },
      { type: "continued", round: 3, step: "standings" },
      polled(lobby(2), T0 + 20 * S),
    );
    expect(roomScreen(view, T0 + 20 * S)).toEqual({ kind: "lobby" });
    expect(view).toMatchObject({ tapped: null, resultSeen: null, continued: null, skipped: [], failedClips: [] });
  });

  it("still ignores a late lobby reply from before the game started", () => {
    const view = run(polled(lobby(1)), polled(finished()), polled(lobby(1)));
    expect(view.latest?.status).toBe("finished");
  });
});
