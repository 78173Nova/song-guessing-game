import { afterEach, describe, expect, it, vi } from "vitest";
import { safely as accountsSafely } from "@/lib/api/accounts";
import { safely as gamesSafely } from "@/lib/api/games";
import { errorSummary } from "@/lib/api/shared";

// The server log gets only the kind of an unexpected error, never its text (security audit, 22 Nov): a database
// error's message and detail can contain an email, part of a password hash or the connection string.
const leakyDbError = Object.assign(new Error('new row violates check constraint "users_email_check"'), {
  name: "NeonDbError",
  code: "23514",
  detail: "Failing row contains (anna@example.com, scrypt$abc123...).",
});

describe("errorSummary", () => {
  it("keeps only the error's name and database code", () => {
    expect(errorSummary(leakyDbError)).toBe("NeonDbError 23514");
  });

  it("keeps only the name when there is no code", () => {
    expect(errorSummary(new TypeError("Cannot read anna@example.com"))).toBe("TypeError");
  });

  it("says 'unknown error' for something that is not an error, such as a thrown text", () => {
    expect(errorSummary("postgres://user:secret@db.example.com/app")).toBe("unknown error");
    expect(errorSummary(null)).toBe("unknown error");
  });

  it("ignores a code that is not a short text", () => {
    expect(errorSummary(Object.assign(new Error("x"), { code: { secret: "anna@example.com" } }))).toBe("Error");
  });
});

describe("safely() writes only the summary to the log", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["accounts", accountsSafely],
    ["games", gamesSafely],
  ])("%s API: a failing request logs the summary, nothing of the message or detail", async (_label, safely) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await safely(async () => {
      throw leakyDbError;
    });

    expect(result.status).toBe(500);
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("NeonDbError 23514");
    expect(logged).not.toContain("anna@example.com");
    expect(logged).not.toContain("scrypt");
    expect(logged).not.toContain("users_email_check");
  });
});
