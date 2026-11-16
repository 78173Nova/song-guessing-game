// Which screen a room page shows during a server-paced game (issue #33), as plain functions. No browser, no
// network: easy to test.
//
// The server moves the game forward by itself; the page only polls the state (decision 008). Two parts:
//   roomReducer – remembers the newest reply, how far this device's clock is off from the server's, the
//                 answer the player tapped, and when this device first saw each result
//   roomScreen  – works out the screen from that and the local time. Called again every ~100 ms, so a round
//                 starts at its start time even if no reply arrives at that moment.
//
// Flow: lobby → get-ready (round 1 is coming) → round → result (5 s, or until "Tap to continue")
//       → next-starting → round → … → result of the last round → final standings.
import { RESULT_SECONDS } from "../game/rooms";
import { ANSWER_TIME_SECONDS } from "../game/scoring";
import type { RoomState, Song, Standing } from "./room-api";

export type RoomView = {
  latest: RoomState | null;
  request: number; // the number of the request `latest` answered
  offsetMs: number; // server clock − this device's clock
  tapped: { round: number; option: number } | null; // sent, not yet in the server's state
  resultSeen: { round: number; at: number } | null; // local time this device first saw the round closed
  continued: number | null; // the round whose result the player skipped
};

export type RoomAction =
  | { type: "polled"; request: number; state: RoomState; receivedAt: number }
  | { type: "answered"; round: number; option: number }
  | { type: "answer-refused"; round: number }
  | { type: "continued"; round: number };

export type RoomScreen =
  | { kind: "loading" }
  | { kind: "lobby" }
  | { kind: "get-ready"; number: number; secondsToStart: number }
  | {
      kind: "round";
      number: number;
      totalRounds: number;
      options: string[];
      startsAt: number; // local time, so the clip can start then
      secondsLeft: number;
      answer: number | null;
    }
  | {
      kind: "result";
      number: number;
      options: string[];
      correctOption: number;
      song: Song;
      answer: number | null;
      correct: boolean;
      points: number;
      score: number;
    }
  | { kind: "next-starting"; number: number }
  | { kind: "final"; standings: Standing[]; me: string };

export const initialRoomView: RoomView = {
  latest: null,
  request: 0,
  offsetMs: 0,
  tapped: null,
  resultSeen: null,
  continued: null,
};

export function roomReducer(view: RoomView, action: RoomAction): RoomView {
  switch (action.type) {
    case "polled": {
      const { state } = action;
      // Replies can overtake each other on a slow connection: only a newer request counts.
      if (action.request <= view.request) return view;
      // A started game never goes back to the lobby.
      if (state.status === "lobby" && view.latest !== null && view.latest.status !== "lobby") return view;

      const round = state.round;
      const newlyClosed = round?.status === "closed" && view.resultSeen?.round !== round.number;
      return {
        ...view,
        latest: state,
        request: action.request,
        // Measured on every reply. The time the reply took to travel is ignored: well under a second.
        offsetMs: Date.parse(state.serverNow) - action.receivedAt,
        resultSeen: newlyClosed ? { round: round.number, at: action.receivedAt } : view.resultSeen,
      };
    }

    case "answered": {
      const state = view.latest;
      if (state === null || view.tapped?.round === action.round) return view;
      // Only the round on screen or the one about to start (the poll may not have caught up yet).
      const onScreen = state.round?.number === action.round || state.nextRound?.number === action.round;
      if (!onScreen) return view;
      return { ...view, tapped: { round: action.round, option: action.option } };
    }

    case "answer-refused":
      return view.tapped?.round === action.round ? { ...view, tapped: null } : view;

    case "continued":
      return { ...view, continued: action.round };
  }
}

const secondsUntil = (time: number, now: number) => Math.max(0, Math.ceil((time - now) / 1000));

// `localNow` is this device's clock (Date.now()).
export function roomScreen(view: RoomView, localNow: number): RoomScreen {
  const state = view.latest;
  if (state === null) return { kind: "loading" };
  if (state.status === "lobby") return { kind: "lobby" };

  const serverNow = localNow + view.offsetMs;
  const answerFor = (number: number) => {
    if (view.tapped?.round === number) return view.tapped.option;
    return state.round?.number === number ? state.me.answer : null;
  };
  const roundScreen = (number: number, options: string[], startsAt: number): RoomScreen => ({
    kind: "round",
    number,
    totalRounds: state.totalRounds,
    options,
    startsAt: startsAt - view.offsetMs,
    secondsLeft: Math.min(ANSWER_TIME_SECONDS, secondsUntil(startsAt + ANSWER_TIME_SECONDS * 1000, serverNow)),
    answer: answerFor(number),
  });

  // The next round's start time has come: start it now, even before a reply says so.
  const next = state.nextRound;
  if (next !== null && serverNow >= Date.parse(next.startsAt)) {
    return roundScreen(next.number, next.options, Date.parse(next.startsAt));
  }

  const round = state.round;
  if (round === null) {
    return { kind: "get-ready", number: next?.number ?? 1, secondsToStart: next ? secondsUntil(Date.parse(next.startsAt), serverNow) : 0 };
  }
  // Still open on the server: keep the round on screen (at 0 s) until a reply closes it.
  if (round.status === "open") return roundScreen(round.number, round.options, Date.parse(round.startsAt));

  const seen = view.resultSeen?.round === round.number ? view.resultSeen.at : localNow;
  const showResult = view.continued !== round.number && localNow < seen + RESULT_SECONDS * 1000;
  if (showResult) {
    return {
      kind: "result",
      number: round.number,
      options: round.options,
      correctOption: round.correctOption!,
      song: round.song!,
      answer: state.me.answer,
      correct: state.me.correct === true,
      points: state.me.points ?? 0,
      score: state.me.score,
    };
  }
  if (state.status === "finished") return { kind: "final", standings: state.standings, me: state.me.nickname };
  return { kind: "next-starting", number: next?.number ?? round.number + 1 };
}
