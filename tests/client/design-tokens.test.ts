import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkContrastPairs, readTokens } from "@/lib/client/contrast";
import { designContrastPairs, readContrastPairs } from "../helpers/design-contrast-pairs";

// The colours come from the real stylesheet; the list of pairs comes from DESIGN.md ("Contrast pairs").
// To use a new text/background pair, add it to that table: this test then checks it in both modes.
const tokens = readTokens(readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8"));
const pairs = designContrastPairs();

describe("reading the pair table", () => {
  it("takes mode, both tokens and the needed ratio from a row and skips other lines", () => {
    const markdown = [
      "| Mode | Foreground | Background | Values | Ratio | Needs | Used for |",
      "|---|---|---|---|---|---|---|",
      "| light | `--color-text` | `--color-bg` | #10142e / #f4f5fb | 16.62 : 1 | 4.5 : 1 | body text |",
      "| dark | `--color-focus` | `--color-surface` | #a88cff / #141936 | 6.43 : 1 | 3 : 1 | focus ring |",
      "| `--background` | `--color-bg` | |",
    ].join("\n");
    expect(readContrastPairs(markdown)).toEqual([
      { mode: "light", foreground: "--color-text", background: "--color-bg", needs: 4.5 },
      { mode: "dark", foreground: "--color-focus", background: "--color-surface", needs: 3 },
    ]);
  });

  it("finds the pairs in DESIGN.md, and every pair is listed for both modes", () => {
    expect(pairs.length).toBeGreaterThan(0);
    const key = (p: (typeof pairs)[number]) => `${p.foreground} on ${p.background} needs ${p.needs}`;
    const light = pairs.filter((p) => p.mode === "light").map(key).sort();
    const dark = pairs.filter((p) => p.mode === "dark").map(key).sort();
    expect(dark).toEqual(light);
  });
});

describe("design tokens in app/globals.css", () => {
  it("reach the contrast DESIGN.md asks for, for every listed pair in light and dark mode", () => {
    expect(checkContrastPairs(tokens, pairs)).toEqual([]);
  });

  it("define every colour token for dark mode as well", () => {
    const colourTokens = (names: string[]) => names.filter((name) => name.startsWith("--color-")).sort();
    expect(colourTokens(Object.keys(tokens.dark))).toEqual(colourTokens(Object.keys(tokens.light)));
  });
});
