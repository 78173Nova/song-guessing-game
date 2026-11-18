import { describe, expect, it } from "vitest";
import { rankText, standingsView } from "@/lib/client/standings-view";

// Standings as the server sends them: rank 1 first, equal points share a rank.
const standing = (nickname: string, rank: number, score: number) => ({ nickname, rank, score });

describe("rankText – a shared rank is visible on screen, not only to screen readers (#65)", () => {
  it("shows a rank nobody shares as the plain number", () => {
    expect(rankText(2, false)).toEqual({ shown: "2", label: "Rank 2" });
  });

  it('shows a shared rank with "=" in front and says "shared" to screen readers', () => {
    expect(rankText(2, true)).toEqual({ shown: "=2", label: "Rank 2, shared" });
  });

  it("gives a tied player in the list the same rank and tie mark as the tied players on the podium", () => {
    // Four players with equal points: three fit on the podium, the fourth goes into the list.
    const view = standingsView(
      [standing("A", 1, 900), standing("B", 1, 900), standing("C", 1, 900), standing("D", 1, 900), standing("E", 5, 10)],
      "E",
    );
    expect(view.podium.map((place) => rankText(place.rank, place.shared).shown)).toEqual(["=1", "=1", "=1"]);
    expect(view.rest.map((row) => [row.nickname, rankText(row.rank, row.shared).shown])).toEqual([
      ["D", "=1"],
      ["E", "5"],
    ]);
  });
});
