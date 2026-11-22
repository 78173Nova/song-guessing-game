import { describe, expect, it } from "vitest";
import { rememberNextPath, safeNextPath, takeNextPath } from "@/lib/client/next-path";
import type { KeyValueStorage } from "@/lib/client/share";

// After logging in, the login page sends the person on to `?next=…` (e.g. back to "Create a room").
// Only a page on this site may be the target, so a link like /login?next=https://evil.example cannot use
// our login page to send people somewhere else.
describe("safeNextPath", () => {
  it("accepts a path on this site", () => {
    expect(safeNextPath("/create")).toBe("/create");
    expect(safeNextPath("/join/482913")).toBe("/join/482913");
  });

  it("falls back to the front page when there is no target", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("refuses targets on other sites and falls back to the front page", () => {
    for (const target of [
      "https://evil.example",
      "//evil.example", // "//" means another site with the same scheme
      "/\\evil.example", // browsers read "/\" like "//"
      "\\\\evil.example",
      "javascript:alert(1)",
      "create", // not starting with "/"
      " /create",
      "/create\nX",
    ]) {
      expect(safeNextPath(target)).toBe("/");
    }
  });

  // A path with "//" further in, which the browser can tidy up into "//evil.example" (security audit, 22 Nov).
  it("refuses any target containing '//'", () => {
    for (const target of ["/.//evil.example", "/././/evil.example", "/a/..//evil.example", "/create//evil.example"]) {
      expect(safeNextPath(target)).toBe("/");
    }
  });

  it("still accepts ordinary paths with a query", () => {
    expect(safeNextPath("/create?from=share")).toBe("/create?from=share");
    expect(safeNextPath("/join/482913")).toBe("/join/482913");
  });
});

// A stand-in for the browser's localStorage.
function fakeStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

// A guest on "Create a room" picks Sign up (/signup?next=/create). The address loses `next` on the way through
// the verification email, so the sign-up page remembers it, and the first login afterwards goes to /create.
describe("coming back to Create a room after signing up", () => {
  it("sends the first login after signing up to the remembered page", () => {
    const storage = fakeStorage();
    rememberNextPath("/create", storage);
    expect(takeNextPath(null, storage)).toBe("/create");
  });

  it("uses the remembered page only once", () => {
    const storage = fakeStorage();
    rememberNextPath("/create", storage);
    takeNextPath(null, storage);
    expect(takeNextPath(null, storage)).toBe("/");
  });

  it("never remembers a page on another site", () => {
    const storage = fakeStorage();
    rememberNextPath("https://evil.example", storage);
    expect(takeNextPath(null, storage)).toBe("/");
  });
});
