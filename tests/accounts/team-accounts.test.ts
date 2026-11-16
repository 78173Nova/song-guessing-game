import { describe, expect, it } from "vitest";
import { parseTeamAccounts } from "@/lib/accounts/rules";

// TEAM_ACCOUNTS lists accounts the team creates ahead of time, already verified (decision 014):
// "email|username|password;email|username|password;…". The values here are made up.
describe("Reading TEAM_ACCOUNTS", () => {
  it("reads every entry, ignoring spaces and a trailing ;, with the email in lowercase", () => {
    const result = parseTeamAccounts(" Anna@Example.com|Anna_99|correct-horse ;\n bob@example.com | Bob | battery-staple; ");

    expect(result).toEqual({
      ok: true,
      accounts: [
        { email: "anna@example.com", username: "Anna_99", password: "correct-horse" },
        { email: "bob@example.com", username: "Bob", password: "battery-staple" },
      ],
    });
  });
});

describe("Reading TEAM_ACCOUNTS – values that are refused", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["only separators and spaces", " ; ;"],
  ])("refuses a %s value", (_, value) => {
    expect(parseTeamAccounts(value)).toEqual({ ok: false, error: "TEAM_ACCOUNTS is empty" });
  });

  it.each([
    ["two parts", "anna@example.com|Anna_99"],
    ["four parts", "anna@example.com|Anna_99|correct-horse|extra"],
    ["an invalid email", "anna.example.com|Anna_99|correct-horse"],
    ["an invalid username", "anna@example.com|Anna 99|correct-horse"],
    ["a password that is too short", "anna@example.com|Anna_99|short"],
    ["a space inside the password", "anna@example.com|Anna_99|correct horse"],
  ])("refuses an entry with %s and names the entry, not the password", (_, entry) => {
    const result = parseTeamAccounts(`bob@example.com|Bob|battery-staple;${entry}`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/^Entry 2 of TEAM_ACCOUNTS/);
    expect(result.error).not.toContain("correct");
    expect(result.error).not.toContain("short");
  });

  it("refuses the same email twice, in any case", () => {
    const result = parseTeamAccounts("anna@example.com|Anna|correct-horse;ANNA@example.com|Anna2|battery-staple");

    expect(result).toEqual({ ok: false, error: "Entry 2 of TEAM_ACCOUNTS repeats an email" });
  });

  it("refuses the same username twice, in any case", () => {
    const result = parseTeamAccounts("anna@example.com|Anna|correct-horse;bob@example.com|ANNA|battery-staple");

    expect(result).toEqual({ ok: false, error: "Entry 2 of TEAM_ACCOUNTS repeats a username" });
  });
});
