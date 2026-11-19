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
//       → next-starting → round → …
//       In a Multiplayer game with 3 or more players, the standings (with "Next round in … s") take the place of
//       next-starting after each round inside a set: the time between rounds stays the same.
//       After the last round of a set (issue #34): result → set summary (10 s) → set standings (5 s) → next-starting.
//       After the last round of the game: result → final standings (5 s) → full summary, which stays.
//       "Tap to continue" skips each of these early on this device only; the next round still starts on time.
import { endsSet } from "../game/room-settings";
import {
  FINAL_STANDINGS_SECONDS,
  hasRoundStandings,
  RESULT_SECONDS,
  SET_STANDINGS_SECONDS,
  SET_SUMMARY_SECONDS,
} from "../game/rooms";
import { ANSWER_TIME_SECONDS } from "../game/scoring";
import type { QuestionType } from "../game/modes";
import type { RoomState, Song, Standing, SummaryItem } from "./room-api";
import { formatCountdown, serverClockOffset } from "./countdown";

export type RoomView = {
  latest: RoomState | null;
  request: number; // the number of the request `latest` answered
  offsetMs: number; // server clock − this device's clock
  tapped: { round: number; option: number } | null; // sent, not yet in the server's state
  resultSeen: { round: number; at: number } | null; // local time this device first saw the round closed
  continued: number | null; // the round whose result the player skipped
  skipped: string[]; // the set summaries and standings the player skipped, as "<round>:summary" / "<round>:standings"
  failedClips: { round: number; url: string }[]; // clips this device could not load, even after a swap (#41)
};

// What "Tap to continue" skips: the result (no step), or the summary or standings after it.
export type SkipStep = "summary" | "standings";

export type RoomAction =
  | { type: "polled"; request: number; state: RoomState; receivedAt: number }
  | { type: "answered"; round: number; option: number }
  | { type: "answer-refused"; round: number }
  | { type: "continued"; round: number; step?: SkipStep }
  | { type: "clip-failed"; round: number; url: string };

export type RoomScreen =
  | { kind: "loading" }
  | { kind: "lobby" }
  | { kind: "get-ready"; number: number; secondsToStart: number }
  | {
      kind: "round";
      number: number;
      totalRounds: number;
      options: string[];
      questionType?: QuestionType; // what the round asks (the room's mode, issue #34)
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
  // After a round inside a set, in a Multiplayer game with 3 or more players: instead of "Next round starting…".
  | { kind: "round-standings"; number: number; standings: Standing[]; me: string; secondsToNext: number }
  | { kind: "set-summary"; set: number; songs: SummaryItem[] }
  | { kind: "set-standings"; set: number; standings: Standing[]; me: string }
  | { kind: "final"; standings: Standing[]; me: string }
  | {
      kind: "final-summary";
      songs: SummaryItem[];
      score: number;
      // "Play again" and "Leave" (issue #43); missing after the last game a room may host.
      playAgain?: { secondsLeft: number; chosen: boolean };
    };

export const initialRoomView: RoomView = {
  latest: null,
  request: 0,
  offsetMs: 0,
  tapped: null,
  resultSeen: null,
  continued: null,
  skipped: [],
  failedClips: [],
};

export function roomReducer(view: RoomView, action: RoomAction): RoomView {
  switch (action.type) {
    case "polled": {
      const { state } = action;
      // Replies can overtake each other on a slow connection: only a newer request counts.
      if (action.request <= view.request) return view;
      // A started game never goes back to the lobby – unless the room is in the lobby for its next game (#43).
      const nextGame = (state.gameNumber ?? 1) > (view.latest?.gameNumber ?? 1);
      if (state.status === "lobby" && view.latest !== null && view.latest.status !== "lobby" && !nextGame) return view;
      // A new game: forget what this device did in the last one.
      const fresh = nextGame ? { tapped: null, resultSeen: null, continued: null, skipped: [], failedClips: [] } : {};

      const round = state.round;
      const newlyClosed = round?.status === "closed" && view.resultSeen?.round !== round.number;
      return {
        ...view,
        ...fresh,
        latest: state,
        request: action.request,
        // Measured on every reply.
        offsetMs: serverClockOffset(state.serverNow, action.receivedAt),
        resultSeen: newlyClosed ? { round: round.number, at: action.receivedAt } : nextGame ? null : view.resultSeen,
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
      if (action.step === undefined) return { ...view, continued: action.round };
      return { ...view, skipped: [...view.skipped, `${action.round}:${action.step}`] };

    case "clip-failed":
      return { ...view, failedClips: [...view.failedClips, { round: action.round, url: action.url }] };
  }
}

const secondsUntil = (time: number, now: number) => Math.max(0, Math.ceil((time - now) / 1000));

// The lobby countdown (issue #37) as this device shows it: the time left on the server's clock and whether this
// viewer sees "Extend +60 s". null when the room has none (private, fewer than 2 players, started).
// `offsetMs` = server clock − this device's clock (RoomView.offsetMs); `localNow` is Date.now().
export function lobbyCountdown(
  state: RoomState,
  offsetMs: number,
  localNow: number,
): { text: string; canExtend: boolean } | null {
  const countdown = state.countdown;
  if (state.status !== "lobby" || countdown === null || countdown === undefined) return null;
  return {
    text: formatCountdown(Date.parse(countdown.endsAt) - (localNow + offsetMs)),
    canExtend: countdown.canExtend,
  };
}

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
  const roundScreen = (number: number, options: string[], startsAt: number, questionType?: QuestionType): RoomScreen => ({
    kind: "round",
    number,
    totalRounds: state.totalRounds,
    options,
    questionType,
    startsAt: startsAt - view.offsetMs,
    secondsLeft: Math.min(ANSWER_TIME_SECONDS, secondsUntil(startsAt + ANSWER_TIME_SECONDS * 1000, serverNow)),
    answer: answerFor(number),
  });

  // The next round's start time has come: start it now, even before a reply says so.
  const next = state.nextRound;
  if (next !== null && serverNow >= Date.parse(next.startsAt)) {
    return roundScreen(next.number, next.options, Date.parse(next.startsAt), next.questionType);
  }

  const round = state.round;
  if (round === null) {
    return { kind: "get-ready", number: next?.number ?? 1, secondsToStart: next ? secondsUntil(Date.parse(next.startsAt), serverNow) : 0 };
  }
  // Still open on the server: keep the round on screen (at 0 s) until a reply closes it.
  if (round.status === "open") return roundScreen(round.number, round.options, Date.parse(round.startsAt), round.questionType);

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

  // After the result: each step lasts until a fixed time after the result appeared, unless the player skipped it.
  const resultEnds = seen + RESULT_SECONDS * 1000;
  const shows = (step: SkipStep, until: number) => !view.skipped.includes(`${round.number}:${step}`) && localNow < until;
  const summary = state.me.summary;

  if (state.status === "finished") {
    const standingsEnd = resultEnds + FINAL_STANDINGS_SECONDS * 1000;
    if (summary === undefined || shows("standings", standingsEnd)) {
      return { kind: "final", standings: state.standings, me: state.me.nickname };
    }
    const vote = state.playAgain;
    if (!vote) return { kind: "final-summary", songs: summary, score: state.me.score };
    return {
      kind: "final-summary",
      songs: summary,
      score: state.me.score,
      playAgain: { secondsLeft: secondsUntil(Date.parse(vote.endsAt), serverNow), chosen: vote.chosen.includes(state.me.nickname) },
    };
  }

  const nextStarting: RoomScreen = { kind: "next-starting", number: next?.number ?? round.number + 1 };
  const songsPerSet = state.settings?.songsPerSet;
  if (summary !== undefined && songsPerSet !== undefined && endsSet(round.number, songsPerSet)) {
    const set = round.number / songsPerSet;
    const summaryEnds = resultEnds + SET_SUMMARY_SECONDS * 1000;
    if (shows("summary", summaryEnds)) {
      return { kind: "set-summary", set, songs: summary.filter((item) => item.set === set) };
    }
    if (shows("standings", summaryEnds + SET_STANDINGS_SECONDS * 1000)) {
      return { kind: "set-standings", set, standings: state.standings, me: state.me.nickname };
    }
    return nextStarting; // the set standings were just shown: no round standings after them
  }
  const game = { type: state.settings?.type, startingPlayers: state.startingPlayers };
  if (next !== null && hasRoundStandings(game) && !view.skipped.includes(`${round.number}:standings`)) {
    return {
      kind: "round-standings",
      number: round.number,
      standings: state.standings,
      me: state.me.nickname,
      secondsToNext: secondsUntil(Date.parse(next.startsAt), serverNow),
    };
  }
  return nextStarting;
}

// Could this device not load the clip of round `number`? Then the round plays without music here and the page
// says "Couldn't play the clip"; the player can still answer. A failure counts only for the clip the round has now:
// if the song was swapped since (by this or another device), the new clip gets its own try.
export function couldNotPlay(view: RoomView, number: number): boolean {
  const url = view.latest?.previewUrls?.[number - 1];
  return url !== undefined && view.failedClips.some((failed) => failed.round === number && failed.url === url);
}

// Which clips this device still has to load: the rounds whose clip address differs from the one it already
// started loading (`started`, by round). At first that is every clip; after a song swap only the swapped round,
// so a clip that is playing is never interrupted.
export function clipsToLoad(started: (string | null)[], urls: string[]): number[] {
  return urls.flatMap((url, index) => (started[index] === url ? [] : [index]));
}
