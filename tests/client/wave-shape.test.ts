import { describe, expect, it } from "vitest";
import {
  BASE_RADIUS,
  blendColours,
  FREQUENCY_BINS,
  idlePulse,
  MAX_RADIUS,
  WAVE_POINTS,
  waveOutline,
} from "@/lib/client/wave-shape";

const SIZE = 200; // a 200 × 200 drawing area: centre (100, 100), base radius 68, maximum 96
const distance = (p: { x: number; y: number }) => Math.hypot(p.x - SIZE / 2, p.y - SIZE / 2);
const meanRadius = (points: { x: number; y: number }[]) =>
  points.reduce((sum, p) => sum + distance(p), 0) / points.length;
const frame = (value: number) => new Uint8Array(FREQUENCY_BINS).fill(value);

describe("waveOutline", () => {
  it("gives a perfect circle at the base radius for silence", () => {
    const points = waveOutline(frame(0), SIZE);
    for (const p of points) expect(distance(p)).toBeCloseTo(68, 6);
  });

  it("gives a larger outline for louder input", () => {
    const quiet = meanRadius(waveOutline(frame(60), SIZE));
    const loud = meanRadius(waveOutline(frame(200), SIZE));
    expect(quiet).toBeGreaterThan(68);
    expect(loud).toBeGreaterThan(quiet);
  });

  it("pushes out only where the music is loud", () => {
    const input = frame(0);
    input[10] = 255; // one loud low band
    const radii = waveOutline(input, SIZE).map(distance);
    expect(Math.max(...radii)).toBeGreaterThan(68);
    expect(Math.min(...radii)).toBeCloseTo(68, 6);
  });

  it("never leaves the drawing area, even at maximum input", () => {
    const points = waveOutline(frame(255), SIZE);
    for (const p of points) {
      expect(distance(p)).toBeLessThanOrEqual(96 + 1e-9);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(SIZE);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(SIZE);
    }
  });

  it("stays inside the drawing area for values above the analyser's range", () => {
    const points = waveOutline(new Array(FREQUENCY_BINS).fill(10_000), SIZE);
    for (const p of points) expect(distance(p)).toBeLessThanOrEqual(96 + 1e-9);
  });

  it("gives the base circle for empty input instead of an error", () => {
    for (const p of waveOutline(new Uint8Array(0), SIZE)) expect(distance(p)).toBeCloseTo(68, 6);
  });

  it("gives the base circle for input of the wrong length", () => {
    for (const p of waveOutline(new Uint8Array(FREQUENCY_BINS + 1).fill(255), SIZE)) {
      expect(distance(p)).toBeCloseTo(68, 6);
    }
    for (const p of waveOutline(new Uint8Array(17).fill(255), SIZE)) expect(distance(p)).toBeCloseTo(68, 6);
  });

  it("gives the base circle when there is no input at all (no analyser)", () => {
    for (const p of waveOutline(null, SIZE)) expect(distance(p)).toBeCloseTo(68, 6);
  });

  it("treats broken values (NaN, negative) as silence", () => {
    const input = new Array(FREQUENCY_BINS).fill(Number.NaN);
    input[3] = -50;
    for (const p of waveOutline(input, SIZE)) expect(distance(p)).toBeCloseTo(68, 6);
  });

  it("always returns the same number of points", () => {
    expect(WAVE_POINTS).toBe(96);
    for (const input of [frame(0), frame(255), new Uint8Array(0), null, new Uint8Array(5)]) {
      expect(waveOutline(input, SIZE)).toHaveLength(96);
    }
  });

  it("starts at the top and goes round clockwise", () => {
    const [first, second] = waveOutline(frame(0), SIZE);
    expect(first.x).toBeCloseTo(100, 6);
    expect(first.y).toBeCloseTo(32, 6); // 100 − 68
    expect(second.x).toBeGreaterThan(100); // clockwise on screen: to the right
  });

  it("uses the sizes from DESIGN.md", () => {
    expect(BASE_RADIUS).toBe(0.34);
    expect(MAX_RADIUS).toBe(0.48);
  });

  it("scales the base circle with the idle pulse, but never past the maximum", () => {
    expect(meanRadius(waveOutline(null, SIZE, 1.03))).toBeCloseTo(68 * 1.03, 6);
    expect(meanRadius(waveOutline(null, SIZE, 0.97))).toBeCloseTo(68 * 0.97, 6);
    for (const p of waveOutline(frame(255), SIZE, 1.03)) expect(distance(p)).toBeLessThanOrEqual(96 + 1e-9);
  });
});

describe("idlePulse", () => {
  it("breathes ±3 % over 2.4 seconds", () => {
    expect(idlePulse(0)).toBeCloseTo(0.97, 9);
    expect(idlePulse(1200)).toBeCloseTo(1.03, 9);
    expect(idlePulse(2400)).toBeCloseTo(0.97, 9);
    expect(idlePulse(600)).toBeCloseTo(1, 9);
  });

  it("never leaves the ±3 % range", () => {
    for (let t = 0; t < 10_000; t += 37) {
      expect(idlePulse(t)).toBeGreaterThanOrEqual(0.97 - 1e-12);
      expect(idlePulse(t)).toBeLessThanOrEqual(1.03 + 1e-12);
    }
  });

  it("stays at 1 for a broken time", () => {
    expect(idlePulse(Number.NaN)).toBe(1);
  });
});

describe("blendColours", () => {
  const app = ["#1d3a8f", "#0891b2", "#7c3aed"];
  const cover = ["#ff0000", "#00ff00", "#0000ff"];

  it("gives the start colours at 0 and the target colours at 1", () => {
    expect(blendColours(app, cover, 0)).toEqual(app);
    expect(blendColours(app, cover, 1)).toEqual(cover);
  });

  it("mixes each colour halfway at 0.5", () => {
    expect(blendColours(["#000000"], ["#ffffff"], 0.5)).toEqual(["#808080"]);
    expect(blendColours(["#ff0000"], ["#0000ff"], 0.5)).toEqual(["#800080"]);
  });

  it("clamps the progress to 0 … 1", () => {
    expect(blendColours(app, cover, -2)).toEqual(app);
    expect(blendColours(app, cover, 7)).toEqual(cover);
  });

  it("repeats colours when the two lists differ in length", () => {
    expect(blendColours(app, ["#ff0000", "#00ff00"], 1)).toEqual(["#ff0000", "#00ff00", "#ff0000"]);
    expect(blendColours(["#000000", "#ffffff"], app, 1)).toEqual(app);
  });

  it("accepts 3-digit colours and spaces around them, as stylesheets may give them", () => {
    expect(blendColours([" #000 "], ["#FFF"], 1)).toEqual(["#ffffff"]);
  });

  it("keeps the start colours when a target colour is not a hex colour", () => {
    expect(blendColours(app, ["#ff0000", "red", "#0000ff"], 1)).toEqual(app);
    expect(blendColours(app, [], 1)).toEqual(app);
  });
});
