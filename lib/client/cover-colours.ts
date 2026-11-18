// Picks 2–3 colours from an album cover's pixels for the wave circle on reveal (DESIGN.md, "The wave circle").
// A pure function (no browser): it gets the pixels as numbers and returns hex colours, so it is easy to test.
// Loading the cover and reading its pixels happens in lib/client/useCoverColours.ts.
//
// How it works, in plain words:
// 1. Skip pixels that are see-through, or nearly grey, black or white (too little colour to show on the ring).
// 2. Sort the rest into 12 groups by hue (red, orange, yellow, … like slices of a colour wheel).
// 3. The biggest groups win; each group's colour is the average of its pixels.
// 4. A colour too close to one already chosen is skipped, so the ring shows different colours.
// If too little of the cover is colourful, it returns null: the circle keeps the app colours.

// How colourful a pixel must be: the gap between its strongest and weakest channel (0–255). Grey, black and
// white pixels have a small gap; e.g. #808080 has 0, #2a2a35 has 11.
const MIN_CHROMA = 48;
// At least this share of the visible pixels must be colourful, or the cover counts as grey.
const MIN_COLOURFUL_SHARE = 0.08;
// A hue group needs at least this share of the colourful pixels to be used (ignores small specks).
const MIN_GROUP_SHARE = 0.1;
const HUE_GROUPS = 12;
const MAX_COLOURS = 3;
// Two chosen colours are at least this far apart (straight-line distance between their red/green/blue values).
export const MIN_COLOUR_DISTANCE = 64;

/**
 * The colours the wave circle shows for a revealed song: 2–3 hex colours ("#rrggbb"), most common first. Made by
 * pickCoverColours, loaded by useCoverColours (lib/client/useCoverColours.ts) and drawn by WaveCircle.
 */
export type CoverColours = string[];

type Rgb = [number, number, number];

// `pixels`: red, green, blue, alpha (0–255) for each pixel, one after the other, like a canvas's getImageData.
// Returns 2–3 hex colours, most common first, or null when the circle should keep the app colours.
export function pickCoverColours(pixels: ArrayLike<number>): CoverColours | null {
  const groups = Array.from({ length: HUE_GROUPS }, () => ({ count: 0, sum: [0, 0, 0] as Rgb }));
  let visible = 0;
  let colourful = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (!(pixels[i + 3] >= 128)) continue; // mostly see-through
    visible++;
    const max = Math.max(r, g, b);
    const chroma = max - Math.min(r, g, b);
    if (!(chroma >= MIN_CHROMA)) continue; // also skips values that are not numbers
    colourful++;
    const group = groups[Math.floor(hueOf(r, g, b, max, chroma) / (360 / HUE_GROUPS)) % HUE_GROUPS];
    group.count++;
    group.sum[0] += r;
    group.sum[1] += g;
    group.sum[2] += b;
  }

  if (visible === 0 || colourful / visible < MIN_COLOURFUL_SHARE) return null;

  const chosen: Rgb[] = [];
  const candidates = groups
    .filter((group) => group.count / colourful >= MIN_GROUP_SHARE)
    .sort((a, b) => b.count - a.count)
    .map((group) => group.sum.map((total) => total / group.count) as Rgb);
  for (const colour of candidates) {
    if (chosen.length === MAX_COLOURS) break;
    if (chosen.every((other) => rgbDistance(colour, other) >= MIN_COLOUR_DISTANCE)) chosen.push(colour);
  }
  if (chosen.length === 0) return null;

  // Only one clear colour: add a second shade of it, so the ring still shows two colours.
  if (chosen.length === 1) chosen.push(otherShade(chosen[0]));
  return chosen.map(toHex);
}

// Hue in degrees (0–360): 0 red, 120 green, 240 blue. `chroma` must be above 0.
function hueOf(r: number, g: number, b: number, max: number, chroma: number): number {
  let hue: number;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  return (hue * 60 + 360) % 360;
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Half-way towards white, or half-way towards black when the colour is already light: always far enough away.
function otherShade(colour: Rgb): Rgb {
  const light = colour[0] + colour[1] + colour[2] > 3 * 160;
  return colour.map((value) => (light ? value * 0.5 : value + (255 - value) * 0.5)) as Rgb;
}

function toHex(colour: Rgb): string {
  return `#${colour.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}
