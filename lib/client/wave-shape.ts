// The wave circle's outline, as plain functions (no React, no browser): easy to test.
// components/WaveCircle.tsx only draws what these return.
//
// One frame of the sound analyser's frequency data (how loud each pitch band is, 0–255) becomes a ring of
// WAVE_POINTS points around the centre of a square drawing area. Silence gives a perfect circle at the base
// radius; louder bands push the outline out, at most to the maximum radius, so it never leaves the canvas.

export type Point = { x: number; y: number };

// Sizes as a share of the drawing area's width (DESIGN.md, "The wave circle").
export const BASE_RADIUS = 0.34;
export const MAX_RADIUS = 0.48;
// The number of points around the ring. Fixed, so the drawing never changes shape abruptly.
export const WAVE_POINTS = 96;
// How many bands the analyser reports per frame (fftSize 256 → 128 bands).
export const FREQUENCY_BINS = 128;

// Only the lower half of the bands is used: the upper ones (above about 11 kHz) are nearly always quiet in a
// song preview. Each half of the ring shows these bands once, mirrored left/right, so the two ends meet.
const USED_BINS = 64;
const HALF = WAVE_POINTS / 2;

// Low bands (bass) are much louder than high ones. A small boost for higher bands spreads the movement round
// the ring instead of only bulging at the top.
function bandWeight(band: number): number {
  return 0.7 + (0.6 * band) / (HALF - 1);
}

// How far band `band` (0 … HALF − 1) pushes out, from 0 (silent) to 1 (as loud as allowed).
function bandLevels(frequencies: ArrayLike<number> | null | undefined): number[] {
  const levels = new Array<number>(HALF).fill(0);
  if (!frequencies || frequencies.length !== FREQUENCY_BINS) return levels; // no or unexpected input → silence
  const raw = levels.map((_, band) => {
    const value = frequencies[Math.floor((band * USED_BINS) / HALF)];
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  // Soften each band with its neighbours, so the outline ripples instead of spiking.
  return levels.map((_, band) => {
    const before = raw[Math.max(0, band - 1)];
    const after = raw[Math.min(HALF - 1, band + 1)];
    const smooth = 0.25 * before + 0.5 * raw[band] + 0.25 * after;
    const level = Math.min(1, (smooth * bandWeight(band)) / 255);
    return level ** 1.5; // quiet bands move a little, beats move a lot
  });
}

// The outline for one frame. `size` is the drawing area's width (and height); `pulse` scales the base radius
// for the idle pulse (1 = no pulse). The first point is at the top, the rest go round clockwise.
export function waveOutline(
  frequencies: ArrayLike<number> | null | undefined,
  size: number,
  pulse = 1,
): Point[] {
  const centre = size / 2;
  const max = MAX_RADIUS * size;
  const base = Math.min(max, BASE_RADIUS * size * pulse);
  const levels = bandLevels(frequencies);
  const points: Point[] = [];
  for (let k = 0; k < WAVE_POINTS; k++) {
    const band = k < HALF ? k : WAVE_POINTS - 1 - k; // mirrored: right half down, left half back up
    const radius = Math.min(max, base + (max - base) * levels[band]);
    const angle = (k / WAVE_POINTS) * 2 * Math.PI;
    points.push({ x: centre + radius * Math.sin(angle), y: centre - radius * Math.cos(angle) });
  }
  return points;
}

// The idle pulse when there is no music to follow (no analyser, sound blocked, landing page): the base radius
// breathes ±3 % over 2.4 seconds. A cosine starts and ends each breath slowly (ease-in-out).
export const IDLE_PULSE_MS = 2400;
const IDLE_PULSE_AMOUNT = 0.03;

export function idlePulse(timeMs: number): number {
  if (!Number.isFinite(timeMs)) return 1;
  return 1 - IDLE_PULSE_AMOUNT * Math.cos((2 * Math.PI * timeMs) / IDLE_PULSE_MS);
}

// Hex colour → [red, green, blue] (0–255), or null for anything else.
function parseHex(colour: string): [number, number, number] | null {
  const hex = colour.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex);
  if (short) return [short[1], short[2], short[3]].map((d) => parseInt(d + d, 16)) as [number, number, number];
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
  if (long) return [long[1], long[2], long[3]].map((d) => parseInt(d, 16)) as [number, number, number];
  return null;
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

// The circle's colours part of the way (0 = `from`, 1 = `to`) through a blend, e.g. from the app colours to the
// album cover's colours on reveal. Lists of different lengths repeat their colours to the longer length.
// If `to` holds anything that is not a hex colour, the circle keeps `from` (it never breaks on a bad colour).
export function blendColours(from: readonly string[], to: readonly string[], progress: number): string[] {
  const start = from.map(parseHex);
  const end = to.map(parseHex);
  const t = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const startOk = start.length > 0 && start.every((c) => c !== null);
  const endOk = end.length > 0 && end.every((c) => c !== null);
  if (!endOk) return startOk ? start.map((c) => toHex(c!)) : [];
  if (!startOk) return end.map((c) => toHex(c!));
  const length = Math.max(start.length, end.length);
  return Array.from({ length }, (_, i) => {
    const a = start[i % start.length]!;
    const b = end[i % end.length]!;
    return toHex(a.map((value, channel) => value + (b[channel] - value) * t));
  });
}
