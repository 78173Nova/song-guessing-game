// How the standings screen shows the standings (#65), as a plain function (no React, no browser): easy to test.
// The top three stand on a podium: the winner in the middle column, second on the left, third on the right.
// Everyone else is a list under it. Ranks come from the server: equal points share a rank, and here they also
// share a podium step and are marked as shared, so the screen can say so. The podium stays in rank order (that
// is the order screen readers read it in); `column` only says where each block stands.
// components/Room.tsx turns this into blocks and rows.
import type { Standing } from "./room-api";

export type StandingRow = Standing & {
  shared: boolean; // another player has the same rank (equal points)
  isMe: boolean; // the viewer's own nickname, highlighted
};

// step: how high the block is (1 = highest; a shared rank gives the same height). column: 1 left, 2 middle, 3 right.
export type PodiumPlace = StandingRow & { step: 1 | 2 | 3; column: 1 | 2 | 3 };

export type StandingsView = { podium: PodiumPlace[]; rest: StandingRow[] };

// The column of the first, second and third entry.
const COLUMNS = [2, 1, 3] as const;
const PODIUM_SIZE = COLUMNS.length;

export function standingsView(standings: Standing[], me: string): StandingsView {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const rows: StandingRow[] = sorted.map((standing) => ({
    ...standing,
    shared: sorted.some((other) => other !== standing && other.rank === standing.rank),
    isMe: standing.nickname === me,
  }));
  const podium = rows.slice(0, PODIUM_SIZE).map((row, index) => ({
    ...row,
    step: Math.min(PODIUM_SIZE, Math.max(1, row.rank)) as 1 | 2 | 3,
    column: COLUMNS[index],
  }));
  return { podium, rest: rows.slice(PODIUM_SIZE) };
}
