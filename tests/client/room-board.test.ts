import { describe, expect, it } from "vitest";
import { answeredInRound, BOARD, boardSeats, SEAT, seatPositions, SONG_RADIUS } from "@/lib/client/room-board";

// The game board of a Multiplayer room (issue #38): the song as a half circle at the bottom middle of the board,
// every other player's nickname around it. Positions are the middle of each nickname label, in board units
// (the board is BOARD.width wide and BOARD.height high, the song's middle is at the bottom middle).

describe("seatPositions", () => {
  it("has no seats when nobody else is in the room", () => {
    expect(seatPositions(0)).toEqual([]);
  });

  it("puts a single other player straight above the song", () => {
    const [seat] = seatPositions(1);
    expect(seat.x).toBeCloseTo(BOARD.width / 2);
    expect(seat.y).toBeLessThan(BOARD.height - SONG_RADIUS - SEAT.height / 2);
  });

  // A room has 2 to 25 players, so 1 to 24 others to place.
  const others = Array.from({ length: 24 }, (_, i) => i + 1);

  it.each(others)("with %i others: every label lies inside the board", (count) => {
    const seats = seatPositions(count);
    expect(seats).toHaveLength(count);
    for (const seat of seats) {
      expect(seat.x - SEAT.width / 2).toBeGreaterThanOrEqual(0);
      expect(seat.x + SEAT.width / 2).toBeLessThanOrEqual(BOARD.width);
      expect(seat.y - SEAT.height / 2).toBeGreaterThanOrEqual(0);
      expect(seat.y + SEAT.height / 2).toBeLessThanOrEqual(BOARD.height);
    }
  });

  it.each(others)("with %i others: no two labels overlap", (count) => {
    const seats = seatPositions(count);
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const apartSideways = Math.abs(seats[i].x - seats[j].x) >= SEAT.width;
        const apartUpDown = Math.abs(seats[i].y - seats[j].y) >= SEAT.height;
        expect(apartSideways || apartUpDown, `labels ${i} and ${j}`).toBe(true);
      }
    }
  });

  it.each(others)("with %i others: no label covers the song's half circle", (count) => {
    const songMiddle = { x: BOARD.width / 2, y: BOARD.height };
    for (const seat of seatPositions(count)) {
      // The point of the label that is closest to the song's middle must be outside the half circle.
      const dx = Math.max(Math.abs(seat.x - songMiddle.x) - SEAT.width / 2, 0);
      const dy = Math.max(songMiddle.y - seat.y - SEAT.height / 2, 0);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(SONG_RADIUS);
    }
  });
});

describe("boardSeats", () => {
  it("seats every other player in room order, leaves out the viewer and ticks who has answered", () => {
    const seats = boardSeats(["Anna", "Ben", "Cleo", "Dan"], "Ben", ["Dan", "Ben"]);
    const positions = seatPositions(3);

    expect(seats).toEqual([
      { nickname: "Anna", answered: false, ...positions[0] },
      { nickname: "Cleo", answered: false, ...positions[1] },
      { nickname: "Dan", answered: true, ...positions[2] },
    ]);
  });

  it("is empty when the viewer is alone", () => {
    expect(boardSeats(["Anna"], "Anna", [])).toEqual([]);
  });
});

describe("answeredInRound", () => {
  const polled = (round: number | null, answered: string[]) => ({ round: round === null ? null : { number: round }, answered });

  it("gives the ticks of the round on screen", () => {
    expect(answeredInRound(polled(2, ["Anna"]), 2)).toEqual(["Anna"]);
  });

  it("gives no ticks while the last reply still describes the previous round (the next one has just started)", () => {
    expect(answeredInRound(polled(1, ["Anna", "Ben"]), 2)).toEqual([]);
    expect(answeredInRound(polled(null, []), 1)).toEqual([]);
  });
});
