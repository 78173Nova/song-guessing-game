// Where the nicknames sit on the game board of a Multiplayer room (issue #38), as plain functions. No browser:
// easy to test.
//
// The board is a box BOARD.width wide and BOARD.height high (board units; the page scales it to the screen, so
// one unit is 1 % of the board's width). The song is a half circle at the bottom middle. The other players'
// nicknames sit on two half ellipses ("rings") around it: a small inner ring and a big outer ring.
//
// Two labels do not overlap when they are a whole label width apart sideways or a whole label height apart up
// or down. So a ring is measured in "label steps": a step sideways counts 1 per label width, a step up or down
// 1 per label height. Seats spread evenly in label steps never overlap their neighbours, also on the steep
// sides of a ring, where labels can sit closer together than at the top.

export const BOARD = { width: 100, height: 80 };
// The size of one nickname label, in board units.
export const SEAT = { width: 15, height: 6 };
// The radius of the song's half circle. Its middle is at the bottom middle of the board.
export const SONG_RADIUS = 14;

export type Seat = { x: number; y: number }; // the middle of a nickname label

type Ring = { rx: number; ry: number }; // half the width and the height of a half ellipse

// Both rings start at the bottom of the board, so the lowest labels just fit in.
const CENTER = { x: BOARD.width / 2, y: BOARD.height - SEAT.height / 2 };
// Found by trying sizes: with these, 1 to 24 labels never overlap (checked in tests/client/room-board.test.ts).
const INNER: Ring = { rx: 23, ry: 26 };
const OUTER: Ring = { rx: BOARD.width / 2 - SEAT.width / 2, ry: 56 };
// Room between neighbouring labels on the same ring, in label steps.
const SPACING = 1.15;
// How finely a ring is measured.
const POINTS_PER_RING = 600;

// Points along a ring from its left end over the top to its right end, with the label steps walked so far.
function walk(ring: Ring) {
  const points: Seat[] = [];
  const stepsSoFar: number[] = [];
  for (let i = 0; i <= POINTS_PER_RING; i++) {
    const angle = (Math.PI * i) / POINTS_PER_RING;
    const point = { x: CENTER.x - ring.rx * Math.cos(angle), y: CENTER.y - ring.ry * Math.sin(angle) };
    const last = points[i - 1];
    const step = last ? Math.max(Math.abs(point.x - last.x) / SEAT.width, Math.abs(point.y - last.y) / SEAT.height) : 0;
    points.push(point);
    stepsSoFar.push((stepsSoFar[i - 1] ?? 0) + step);
  }
  return { points, length: stepsSoFar[POINTS_PER_RING], stepsSoFar };
}

const RINGS = [INNER, OUTER].map((ring) => {
  const walked = walk(ring);
  // How many labels fit on the ring with SPACING between neighbours.
  return { ...walked, capacity: Math.floor(walked.length / SPACING) + 1 };
});

// `count` seats spread evenly (in label steps) over a ring. One seat sits at the top.
function spread(ring: (typeof RINGS)[number], count: number): Seat[] {
  if (count === 0) return [];
  if (count === 1) return [ring.points[POINTS_PER_RING / 2]];
  return Array.from({ length: count }, (_, i) => {
    const target = (ring.length * i) / (count - 1);
    const index = ring.stepsSoFar.findIndex((steps) => steps >= target - 1e-9);
    return ring.points[index === -1 ? POINTS_PER_RING : index];
  });
}

// The middle of each of `count` nickname labels (inner ring first, each ring from left over the top to right):
// the inner ring alone while everyone fits on it, otherwise both rings, each with its share of the seats.
export function seatPositions(count: number): Seat[] {
  const [inner, outer] = RINGS;
  const onInner = count <= inner.capacity ? count : Math.round((count * inner.capacity) / (inner.capacity + outer.capacity));
  return [...spread(inner, onInner), ...spread(outer, count - onInner)];
}

export type BoardSeat = Seat & { nickname: string; answered: boolean };

// Every player except the viewer (`me`, whose nickname sits above the answers), in room order, with a tick for
// those in `answered` – the nicknames the room state lists for the round on screen.
export function boardSeats(players: string[], me: string, answered: string[]): BoardSeat[] {
  const others = players.filter((nickname) => nickname !== me);
  const positions = seatPositions(others.length);
  return others.map((nickname, i) => ({ nickname, answered: answered.includes(nickname), ...positions[i] }));
}

// The ticks for round `number`. A round can start on screen before the next reply arrives (roomScreen starts it
// at its start time); until then the last reply's list belongs to the round before, so no ticks yet.
export function answeredInRound(
  state: { round: { number: number } | null; answered: string[] },
  number: number,
): string[] {
  return state.round?.number === number ? state.answered : [];
}
