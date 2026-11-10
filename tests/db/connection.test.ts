import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Never connects to anything: it only checks the missing-variable case.
describe("getDb", () => {
  it("throws a clear error when DATABASE_URL is not set", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });

  it("throws the same error when DATABASE_URL is empty", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });
});
