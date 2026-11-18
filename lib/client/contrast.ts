// Colour contrast as defined by WCAG 2.x, used by the test that guards the design tokens in app/globals.css
// (DESIGN.md, "Contrast pairs"). Pure functions: no browser, no files.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Turns "#abc" or "#aabbcc" into red, green and blue from 0 to 255. Throws on anything else. */
function parseHex(colour: string): [number, number, number] {
  const match = HEX.exec(colour.trim());
  if (!match) throw new Error(`Not a 3- or 6-digit hex colour: "${colour}"`);
  let digits = match[1];
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** How bright a colour looks to the eye, from 0 (black) to 1 (white) – WCAG "relative luminance". */
function luminance(colour: string): number {
  const [r, g, b] = parseHex(colour).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two hex colours: 1 (no contrast) to 21 (black on white). Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export type Tokens = Record<string, string>;

/** Splits CSS into its top-level rules: the text before each "{" and everything up to the matching "}". */
function topLevelRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  let start = 0;
  let depth = 0;
  let open = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (css[i] === "}" && depth > 0) {
      depth--;
      if (depth === 0) {
        rules.push({ selector: css.slice(start, open).trim(), body: css.slice(open + 1, i) });
        start = i + 1;
      }
    }
  }
  return rules;
}

/** Reads the custom properties ("--name: value;") written directly in a rule's body. */
function declarations(body: string): Tokens {
  const tokens: Tokens = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

/**
 * Reads the design tokens from a stylesheet: `light` from the top-level `:root` block, `dark` only from
 * `:root` inside `@media (prefers-color-scheme: dark)`. Other blocks (e.g. reduce motion) are ignored.
 */
export function readTokens(css: string): { light: Tokens; dark: Tokens } {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const light: Tokens = {};
  const dark: Tokens = {};
  for (const rule of topLevelRules(withoutComments)) {
    if (rule.selector === ":root") Object.assign(light, declarations(rule.body));
    if (/^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/.test(rule.selector)) {
      for (const inner of topLevelRules(rule.body)) {
        if (inner.selector === ":root") Object.assign(dark, declarations(inner.body));
      }
    }
  }
  return { light, dark };
}

/** One text/background pair from DESIGN.md: which mode, which two tokens and the ratio it needs (4.5 or 3). */
export type ContrastPair = {
  mode: "light" | "dark";
  foreground: string;
  background: string;
  needs: number;
};

/**
 * Checks every pair against the tokens of its mode. Returns one plain-language problem per failing pair
 * (too little contrast, a missing token, a value that is not a hex colour); an empty list means all pass.
 * The ratio is not rounded before comparing, as WCAG asks.
 */
export function checkContrastPairs(tokens: { light: Tokens; dark: Tokens }, pairs: ContrastPair[]): string[] {
  const problems: string[] = [];
  for (const pair of pairs) {
    const modeTokens = tokens[pair.mode];
    const where = `${pair.mode}: ${pair.foreground} on ${pair.background}`;
    const missing = [pair.foreground, pair.background].filter((name) => modeTokens[name] === undefined);
    if (missing.length > 0) {
      problems.push(`${where}: ${missing.join(", ")} missing in ${pair.mode} mode`);
      continue;
    }
    const notHex = [pair.foreground, pair.background].filter((name) => !HEX.test(modeTokens[name]));
    if (notHex.length > 0) {
      problems.push(`${where}: ${notHex.map((name) => `${name} (${modeTokens[name]})`).join(", ")} is not a hex colour`);
      continue;
    }
    const ratio = contrastRatio(modeTokens[pair.foreground], modeTokens[pair.background]);
    if (ratio < pair.needs) {
      problems.push(`${where}: ${ratio.toFixed(2)} : 1, needs ${pair.needs} : 1`);
    }
  }
  return problems;
}
