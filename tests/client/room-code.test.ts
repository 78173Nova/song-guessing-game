import { describe, expect, it } from "vitest";
import { parseRoomCode } from "@/lib/client/room-code";

describe("parseRoomCode", () => {
  it("accepts a 6-digit room code", () => {
    expect(parseRoomCode("482913")).toBe("482913");
  });

  it("ignores spaces around the code, e.g. when pasted from a chat", () => {
    expect(parseRoomCode("  482913 ")).toBe("482913");
  });

  it("rejects codes with 5 or 7 digits", () => {
    expect(parseRoomCode("48291")).toBeNull();
    expect(parseRoomCode("4829130")).toBeNull();
  });

  it("rejects anything that is not plain digits 0-9", () => {
    expect(parseRoomCode("48a913")).toBeNull();
    expect(parseRoomCode("48 913")).toBeNull(); // a space inside is not trimmed
    expect(parseRoomCode("４８２９１３")).toBeNull(); // full-width digits
  });

  it("rejects an empty box", () => {
    expect(parseRoomCode("")).toBeNull();
    expect(parseRoomCode("   ")).toBeNull();
  });

  it("rejects a code starting with 0, because real room codes never do", () => {
    expect(parseRoomCode("012345")).toBeNull();
  });
});
