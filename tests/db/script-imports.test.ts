import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// `npm run db:seed` and `npm run db:team-accounts` run with plain Node, not with Next.js or Vitest.
// Plain Node needs the full file name in every relative import ("./genres.ts", not "./genres");
// Next.js and Vitest add the ".ts" themselves. So a missing ".ts" anywhere in a script's imports
// breaks only the script, while the app, the other tests and the build stay green.
// These tests load each file a script imports with plain Node. They never run the scripts,
// so no database and no network are used.

const ROOT = resolve(__dirname, "../..");
const SCRIPTS = ["db/seed.ts", "db/team-accounts.ts"];
// Starting Node a few times can be slow on a busy machine.
const TIMEOUT_MS = 30_000;

// The relative imports of a script, as absolute paths. Type-only imports are left out:
// Node removes them before running, so they cannot break the script.
function importsOf(script: string): string[] {
  const path = resolve(ROOT, script);
  const source = readFileSync(path, "utf8");
  const found = source.matchAll(/^import\s+(?!type\s)[^;]*?\sfrom\s+"(\.{1,2}\/[^"]+)"/gm);
  return [...found].map((match) => resolve(dirname(path), match[1]));
}

// Loads one file with plain Node, the same way the npm scripts start Node. Returns Node's error
// output, or null when the file loaded.
function loadWithPlainNode(file: string): string | null {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(pathToFileURL(file).href)});`,
    ],
    // Only PATH is passed on, so the loaded files see no DATABASE_URL or other secrets.
    { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" } },
  );
  return result.status === 0 ? null : result.stderr;
}

describe("database scripts load with plain Node", () => {
  for (const script of SCRIPTS) {
    it(
      `every file ${script} imports loads`,
      () => {
        const files = importsOf(script);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
          const error = loadWithPlainNode(file);
          // On failure, Node's message names the file and the import that is missing ".ts".
          expect(error, `${script} -> ${file}`).toBeNull();
        }
      },
      TIMEOUT_MS,
    );
  }

  it(
    "catches an import without .ts",
    () => {
      const error = loadWithPlainNode(resolve(ROOT, "tests/fixtures/plain-node/missing-extension.ts"));
      expect(error).toContain("ERR_MODULE_NOT_FOUND");
    },
    TIMEOUT_MS,
  );
});
