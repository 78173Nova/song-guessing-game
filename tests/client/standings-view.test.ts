import { describe, expect, it } from "vitest";
import { standingsView } from "@/lib/client/standings-view";

// Standings as the server sends them: rank 1 first, equal points share a rank.
const standing = (nickname: string, rank: number, score: number) => ({ nickname, rank, score });

describe("standingsView – the podium and the list under it (#65)", () => {
  it("puts the top three on the podium in rank order: winner in the middle column, second left, third right", () => {
    const view = standingsView(
      [standing("Mila", 1, 2310), standing("Jonas", 2, 1980), standing("Ana", 3, 1400), standing("Theo", 4, 1120)],
      "Theo",
    );
    expect(view.podium.map((place) => [place.nickname, place.step, place.column])).toEqual([
      ["Mila", 1, 2],
      ["Jonas", 2, 1],
      ["Ana", 3, 3],
    ]);
    expect(view.rest.map((row) => row.nickname)).toEqual(["Theo"]);
  });

  it("gives players with equal points the same rank and the same podium step, and marks them as shared", () => {
    const view = standingsView([standing("Mila", 1, 900), standing("Jonas", 1, 900), standing("Ana", 3, 400)], "Ana");
    expect(view.podium.map((place) => [place.nickname, place.rank, place.step, place.shared])).toEqual([
      ["Mila", 1, 1, true],
      ["Jonas", 1, 1, true],
      ["Ana", 3, 3, false],
    ]);
  });

  it("marks a shared rank in the list, also when it is shared with a player on the podium", () => {
    const view = standingsView(
      [
        standing("A", 1, 50),
        standing("B", 2, 40),
        standing("C", 3, 30),
        standing("D", 3, 30),
        standing("E", 5, 10),
        standing("F", 5, 10),
        standing("G", 7, 0),
      ],
      "G",
    );
    expect(view.podium.find((place) => place.nickname === "C")?.shared).toBe(true);
    expect(view.rest.map((row) => [row.nickname, row.rank, row.shared])).toEqual([
      ["D", 3, true],
      ["E", 5, true],
      ["F", 5, true],
      ["G", 7, false],
    ]);
  });

  it("highlights the viewer's own nickname wherever it is", () => {
    const onPodium = standingsView([standing("Mila", 1, 10), standing("Jonas", 2, 5)], "Mila");
    expect(onPodium.podium.filter((place) => place.isMe).map((place) => place.nickname)).toEqual(["Mila"]);

    const inList = standingsView(
      [standing("A", 1, 4), standing("B", 2, 3), standing("C", 3, 2), standing("Mila", 4, 1)],
      "Mila",
    );
    expect(inList.podium.some((place) => place.isMe)).toBe(false);
    expect(inList.rest.map((row) => [row.nickname, row.isMe])).toEqual([["Mila", true]]);
  });

  it("works with two players (no third step) and with one, the winner always in the middle column", () => {
    const two = standingsView([standing("Mila", 1, 10), standing("Jonas", 2, 5)], "Jonas");
    expect(two.podium.map((place) => [place.nickname, place.column])).toEqual([
      ["Mila", 2],
      ["Jonas", 1],
    ]);
    expect(two.rest).toEqual([]);

    const one = standingsView([standing("Mila", 1, 10)], "Mila");
    expect(one.podium.map((place) => [place.nickname, place.column])).toEqual([["Mila", 2]]);
  });

  it("returns an empty podium and list for no standings", () => {
    expect(standingsView([], "Mila")).toEqual({ podium: [], rest: [] });
  });

  it("keeps everyone in a room of 25: three on the podium, 22 in the list in rank order", () => {
    const standings = Array.from({ length: 25 }, (_, i) => standing(`Player ${i + 1}`, i + 1, 2500 - i * 100));
    const view = standingsView(standings, "Player 25");
    expect(view.podium).toHaveLength(3);
    expect(view.rest).toHaveLength(22);
    expect(view.rest[0].rank).toBe(4);
    expect(view.rest[21]).toMatchObject({ nickname: "Player 25", rank: 25, isMe: true });
  });

  it("orders by rank even if the list arrives out of order", () => {
    const view = standingsView([standing("C", 3, 1), standing("A", 1, 3), standing("B", 2, 2)], "A");
    expect(view.podium.map((place) => place.nickname)).toEqual(["A", "B", "C"]);
  });
});
