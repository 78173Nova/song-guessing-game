import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/client/next-path";

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
});
