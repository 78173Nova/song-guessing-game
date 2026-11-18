// The duel layout of a room round (issue #39), as plain functions. No browser: easy to test.
// A game with exactly two players shows the duel layout: every Duel room, and a Multiplayer room whose game
// started with 2 players (the room state's startingPlayers, so it stays a duel when one of them leaves).
// Every other game shows the Multiplayer game board (lib/client/room-board.ts).
import type { RoomType } from "@/lib/game/room-settings";

export type RoomLayout = "duel" | "board";

export function roomLayout(state: {
  settings?: { type: RoomType };
  startingPlayers?: number | null;
}): RoomLayout {
  if (state.settings?.type === "duel") return "duel";
  return state.startingPlayers === 2 ? "duel" : "board";
}

export type DuelSides = {
  me: { nickname: string; score: number };
  // null once the other player has left the game: the viewer plays on alone.
  opponent: { nickname: string; score: number; answered: boolean; away: boolean } | null;
};

// The viewer (bottom, above the answers) and the opponent (top), each with their score from the standings –
// which count closed rounds only, so the scores change after each round, never during one. `answered` is the
// list for the round on screen (answeredInRound): the opponent gets a tick, never what they answered.
export function duelSides(
  state: {
    players: string[];
    away?: string[];
    me: { nickname: string };
    standings: { nickname: string; score: number }[];
  },
  answered: string[],
): DuelSides {
  const scoreOf = (nickname: string) => state.standings.find((s) => s.nickname === nickname)?.score ?? 0;
  const other = state.players.find((nickname) => nickname !== state.me.nickname);
  return {
    me: { nickname: state.me.nickname, score: scoreOf(state.me.nickname) },
    opponent:
      other === undefined
        ? null
        : {
            nickname: other,
            score: scoreOf(other),
            answered: answered.includes(other),
            away: (state.away ?? []).includes(other),
          },
  };
}

// What the viewer last saw of each duel score (issue #66). The duel layout shows only while a round is open, and
// the scores change after the round closes, while it is hidden; so when the next round's duel appears, each score
// rolls from the value seen last to the new one. A lower score than last seen means a new game: no roll down.
export function scoreMemory() {
  const seen = new Map<string, number>();
  return {
    startOf(nickname: string, score: number): number {
      const last = seen.get(nickname);
      return last === undefined || last > score ? score : last;
    },
    remember(nickname: string, score: number): void {
      seen.set(nickname, score);
    },
  };
}

export type ScoreMemory = ReturnType<typeof scoreMemory>;
