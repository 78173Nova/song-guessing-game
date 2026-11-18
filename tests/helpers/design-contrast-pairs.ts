import { readFileSync } from "node:fs";
import type { ContrastPair } from "@/lib/client/contrast";

/**
 * Reads the "Contrast pairs (checked)" table from a DESIGN.md text. Each row is
 * `| mode | `--fg` | `--bg` | values | ratio | needs | used for |`; only the mode, the two token names and the
 * needed ratio are taken. The hex values and ratios written in the table are ignored: the test takes the colours
 * from app/globals.css, so the stylesheet is what gets checked.
 */
export function readContrastPairs(markdown: string): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim());
    // cells[0] is the empty text before the first "|"
    const [, mode, foreground, background, , , needs] = cells;
    if (mode !== "light" && mode !== "dark") continue;
    const token = /^`(--[\w-]+)`$/;
    const fg = token.exec(foreground ?? "");
    const bg = token.exec(background ?? "");
    const ratio = /^([\d.]+) : 1$/.exec(needs ?? "");
    if (!fg || !bg || !ratio) throw new Error(`Cannot read contrast pair row: ${line}`);
    pairs.push({ mode, foreground: fg[1], background: bg[1], needs: Number(ratio[1]) });
  }
  return pairs;
}

/** The pairs from the project's DESIGN.md. */
export function designContrastPairs(): ContrastPair[] {
  return readContrastPairs(readFileSync(new URL("../../DESIGN.md", import.meta.url), "utf8"));
}
