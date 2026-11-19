import { describe, expect, it } from "vitest";
import { checkContrastPairs, contrastRatio, readTokens, type ContrastPair } from "@/lib/client/contrast";

describe("contrastRatio", () => {
  it("gives 21 : 1 for black on white, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("gives 1 : 1 for a colour on itself", () => {
    expect(contrastRatio("#5a2fd0", "#5a2fd0")).toBeCloseTo(1, 5);
  });

  it("reads 3-digit hex the same as the 6-digit form, in any letter case", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFF", "#5A2FD0")).toBeCloseTo(contrastRatio("#ffffff", "#5a2fd0"), 10);
  });

  it("matches a ratio worked out by hand in DESIGN.md (#10142e on #f4f5fb is 16.62 : 1)", () => {
    expect(contrastRatio("#10142e", "#f4f5fb")).toBeCloseTo(16.62, 2);
  });

  it("rejects a value that is not a 3- or 6-digit hex colour", () => {
    for (const bad of ["", "red", "#12", "#1234", "#gggggg", "rgb(0 0 0)", "000000"]) {
      expect(() => contrastRatio(bad, "#ffffff")).toThrow();
    }
  });
});

describe("readTokens", () => {
  const css = `
    /* --color-text: #ff0000; a comment is not a token */
    :root {
      --color-text: #10142e;
      --color-bg: #F4F5FB;
      --background: var(--color-bg);
    }
    @media (prefers-reduced-motion: reduce) {
      :root { --duration-fast: 0ms; }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --color-text: #eef0ff;
      }
    }
    body { color: var(--color-text); }
  `;

  it("reads the light tokens from the top-level :root block", () => {
    expect(readTokens(css).light).toEqual({
      "--color-text": "#10142e",
      "--color-bg": "#F4F5FB",
      "--background": "var(--color-bg)",
    });
  });

  it("reads the dark tokens only from :root inside the dark-mode block", () => {
    expect(readTokens(css).dark).toEqual({ "--color-text": "#eef0ff" });
  });

  it("gives empty lists for a stylesheet without tokens", () => {
    expect(readTokens("body { margin: 0; }")).toEqual({ light: {}, dark: {} });
  });
});

describe("checkContrastPairs", () => {
  const tokens = {
    light: { "--color-text": "#10142e", "--color-bg": "#ffffff", "--color-pale": "#aaaaaa" },
    dark: { "--color-text": "#eef0ff", "--color-bg": "#0a0d24", "--color-pale": "#aaaaaa" },
  };
  const textOnBg = (mode: "light" | "dark", needs = 4.5): ContrastPair => ({
    mode,
    foreground: "--color-text",
    background: "--color-bg",
    needs,
  });

  it("reports nothing when every pair reaches its ratio in both modes", () => {
    expect(checkContrastPairs(tokens, [textOnBg("light"), textOnBg("dark")])).toEqual([]);
  });

  it("reports a pair that is too light, naming the mode, tokens and ratios", () => {
    const pale: ContrastPair = { mode: "light", foreground: "--color-pale", background: "--color-bg", needs: 4.5 };
    const problems = checkContrastPairs(tokens, [pale]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/light.*--color-pale.*--color-bg.*2\.32.*4\.5/);
  });

  it("lets the same pair pass when it only needs 3 : 1 and fail when it needs 4.5 : 1", () => {
    // #767676 on white is 4.54 : 1; #949494 on white is 3.03 : 1 (known reference values)
    const grey = { light: { "--a": "#949494", "--b": "#ffffff" }, dark: {} };
    expect(checkContrastPairs(grey, [{ mode: "light", foreground: "--a", background: "--b", needs: 3 }])).toEqual([]);
    expect(checkContrastPairs(grey, [{ mode: "light", foreground: "--a", background: "--b", needs: 4.5 }])).toHaveLength(1);
  });

  it("reports a token that is missing from dark mode instead of crashing", () => {
    const noDarkText = { light: tokens.light, dark: { "--color-bg": "#0a0d24" } };
    const problems = checkContrastPairs(noDarkText, [textOnBg("light"), textOnBg("dark")]);
    expect(problems).toEqual([expect.stringMatching(/dark.*--color-text.*missing/)]);
  });

  it("reports a token whose value is not a hex colour", () => {
    const aliased = { light: { "--color-text": "var(--x)", "--color-bg": "#ffffff" }, dark: {} };
    expect(checkContrastPairs(aliased, [textOnBg("light")])).toEqual([
      expect.stringMatching(/light.*--color-text.*not a hex colour/),
    ]);
  });
});
