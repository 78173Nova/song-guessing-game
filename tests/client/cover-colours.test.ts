import { describe, expect, it } from "vitest";
import { MIN_COLOUR_DISTANCE, pickCoverColours } from "@/lib/client/cover-colours";

// A fake cover: RGBA pixel data (like canvas getImageData) made of `count` pixels of each hex colour.
function cover(...parts: [string, number][]): Uint8ClampedArray {
  const pixels: number[] = [];
  for (const [hex, count] of parts) {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let n = 0; n < count; n++) pixels.push(rgb[0], rgb[1], rgb[2], 255);
  }
  return new Uint8ClampedArray(pixels);
}

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a: string, b: string) => Math.hypot(...rgbOf(a).map((value, i) => value - rgbOf(b)[i]));

describe("pickCoverColours", () => {
  it("returns the fallback (null) for empty pixel data", () => {
    expect(pickCoverColours(new Uint8ClampedArray(0))).toBeNull();
  });

  it("returns the clear colours of a colourful cover, most common first", () => {
    const pixels = cover(["#e63946", 500], ["#1d4ed8", 300], ["#facc15", 200]);
    expect(pickCoverColours(pixels)).toEqual(["#e63946", "#1d4ed8", "#facc15"]);
  });

  it("ignores the grey, black and white parts of a cover", () => {
    const pixels = cover(["#ffffff", 400], ["#101010", 300], ["#e63946", 200], ["#1d4ed8", 100]);
    expect(pickCoverColours(pixels)).toEqual(["#e63946", "#1d4ed8"]);
  });

  it("returns at most three colours", () => {
    const pixels = cover(["#e63946", 300], ["#1d4ed8", 250], ["#facc15", 200], ["#16a34a", 150], ["#9333ea", 100]);
    expect(pickCoverColours(pixels)).toEqual(["#e63946", "#1d4ed8", "#facc15"]);
  });

  it("returns the fallback for a nearly grey cover", () => {
    const pixels = cover(["#7a7d80", 400], ["#8a8580", 300], ["#5f6266", 300]);
    expect(pickCoverColours(pixels)).toBeNull();
  });

  it("returns the fallback for a nearly black cover", () => {
    expect(pickCoverColours(cover(["#050505", 700], ["#14121a", 300]))).toBeNull();
  });

  it("returns the fallback for a nearly white cover", () => {
    expect(pickCoverColours(cover(["#fafafa", 700], ["#f0eeea", 300]))).toBeNull();
  });

  it("returns the fallback for a black-and-white cover with only a speck of colour", () => {
    const pixels = cover(["#000000", 500], ["#ffffff", 450], ["#e63946", 50]);
    expect(pickCoverColours(pixels)).toBeNull();
  });

  it("returns the fallback for a fully see-through cover", () => {
    const pixels = cover(["#e63946", 100]).map((value, i) => (i % 4 === 3 ? 0 : value));
    expect(pickCoverColours(pixels)).toBeNull();
  });

  it("never returns two colours that look nearly the same", () => {
    // Two oranges just either side of the border between two hue groups (29° and 31°), and a blue.
    const pixels = cover(["#e07a1a", 400], ["#e0801a", 350], ["#1d4ed8", 250]);
    const colours = pickCoverColours(pixels)!;
    expect(colours).toEqual(["#e07a1a", "#1d4ed8"]);
    expect(distance(colours[0], colours[1])).toBeGreaterThanOrEqual(MIN_COLOUR_DISTANCE);
  });

  it("adds a second, clearly different shade when the cover has only one clear colour", () => {
    const colours = pickCoverColours(cover(["#1d4ed8", 600], ["#000000", 400]))!;
    expect(colours).toHaveLength(2);
    expect(colours[0]).toBe("#1d4ed8");
    expect(distance(colours[0], colours[1])).toBeGreaterThanOrEqual(MIN_COLOUR_DISTANCE);
  });
});
