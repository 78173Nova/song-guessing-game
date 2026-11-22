import { describe, expect, it } from "vitest";
import {
  hasRoundStandings,
  isRoomClosed,
  isRoundClosed,
  isTimeUp,
  isValidRoomCode,
  parseNickname,
  parseRoomAnswerInput,
  rankByScore,
  readBearerToken,
  secondsLeft,
} from "@/lib/game/rooms";

const START = new Date("2026-11-15T12:00:00.000Z");
const after = (seconds: number) => new Date(START.getTime() + seconds * 1000);

describe("parseNickname", () => {
  it("accepts a normal nickname and trims the spaces around it", () => {
    expect(parseNickname("Anna")).toBe("Anna");
    expect(parseNickname("  Anna  ")).toBe("Anna");
    expect(parseNickname("Anna B")).toBe("Anna B");
  });

  it("accepts 1 and 20 characters and rejects 0 and 21", () => {
    expect(parseNickname("A")).toBe("A");
    expect(parseNickname("a".repeat(20))).toBe("a".repeat(20));
    expect(parseNickname("a".repeat(21))).toBeNull();
    expect(parseNickname("")).toBeNull();
  });

  it("rejects a nickname of only spaces", () => {
    expect(parseNickname("     ")).toBeNull();
  });

  it("counts the length after trimming", () => {
    expect(parseNickname(`  ${"a".repeat(20)}  `)).toBe("a".repeat(20));
  });

  it("counts an emoji as one character", () => {
    expect(parseNickname("🎵Anna")).toBe("🎵Anna");
    expect(parseNickname("🎵".repeat(20))).toBe("🎵".repeat(20));
    expect(parseNickname("🎵".repeat(21))).toBeNull();
  });

  it("rejects control characters", () => {
    expect(parseNickname("An\nna")).toBeNull(); // new line
    expect(parseNickname("An\tna")).toBeNull(); // tab
    expect(parseNickname("An\u0000na")).toBeNull(); // NUL
    expect(parseNickname("An\u007fna")).toBeNull(); // DEL
  });

  it("rejects everything that is not text", () => {
    for (const value of [undefined, null, 42, true, ["Anna"], { nickname: "Anna" }]) {
      expect(parseNickname(value)).toBeNull();
    }
  });
});

describe("isValidRoomCode", () => {
  it("accepts 6 digits that do not start with 0", () => {
    expect(isValidRoomCode("482913")).toBe(true);
    expect(isValidRoomCode("100000")).toBe(true);
    expect(isValidRoomCode("999999")).toBe(true);
  });

  it("rejects every other shape", () => {
    for (const code of ["082913", "48291", "4829134", "48a913", " 482913", "482913 ", "", 482913, null, undefined]) {
      expect(isValidRoomCode(code)).toBe(false);
    }
  });
});

describe("readBearerToken", () => {
  const token = "0123456789abcdef".repeat(4); // 64 hex characters

  it("reads the token from 'Bearer <token>'", () => {
    expect(readBearerToken(`Bearer ${token}`)).toBe(token);
  });

  it("returns null for a missing header, another scheme or a token of the wrong shape", () => {
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken("")).toBeNull();
    expect(readBearerToken(token)).toBeNull(); // "Bearer " is missing
    expect(readBearerToken(`Basic ${token}`)).toBeNull();
    expect(readBearerToken(`Bearer ${token.slice(1)}`)).toBeNull(); // 63 characters
    expect(readBearerToken(`Bearer ${token}0`)).toBeNull(); // 65 characters
    expect(readBearerToken(`Bearer ${"g".repeat(64)}`)).toBeNull(); // not hex
    expect(readBearerToken(`Bearer ${token.toUpperCase()}`)).toBeNull();
  });
});

describe("isRoomClosed", () => {
  const minutes = (m: number) => m * 60;
  const hours = (h: number) => h * 60 * 60;
  const lobby = { createdAt: START, status: "lobby" as const };
  const playing = { createdAt: START, status: "playing" as const };
  const finished = { createdAt: START, status: "finished" as const };

  it("keeps a room in the lobby open until just before 30 minutes after it was created", () => {
    expect(isRoomClosed(lobby, START)).toBe(false);
    expect(isRoomClosed(lobby, after(minutes(30) - 0.001))).toBe(false);
  });

  it("closes a room whose game has not started from exactly 30 minutes on", () => {
    expect(isRoomClosed(lobby, after(minutes(30)))).toBe(true);
    expect(isRoomClosed(lobby, after(hours(2)))).toBe(true);
  });

  it("keeps a started room open after 30 minutes, until just before 3 hours", () => {
    expect(isRoomClosed(playing, after(minutes(30)))).toBe(false);
    expect(isRoomClosed(playing, after(hours(3) - 0.001))).toBe(false);
    expect(isRoomClosed(finished, after(hours(3) - 0.001))).toBe(false);
  });

  it("closes every room from exactly 3 hours on", () => {
    expect(isRoomClosed(playing, after(hours(3)))).toBe(true);
    expect(isRoomClosed(finished, after(hours(3)))).toBe(true);
    expect(isRoomClosed(lobby, after(hours(30)))).toBe(true);
  });
});

describe("isTimeUp / secondsLeft / isRoundClosed", () => {
  it("the time is up only after more than 15 seconds", () => {
    expect(isTimeUp(START, after(0))).toBe(false);
    expect(isTimeUp(START, after(14.9))).toBe(false);
    expect(isTimeUp(START, after(15))).toBe(false); // exactly 15 s still counts, like in scoring.ts
    expect(isTimeUp(START, after(15.001))).toBe(true);
  });

  it("secondsLeft counts down from 15 to 0 and never goes below 0 or above 15", () => {
    expect(secondsLeft(START, after(0))).toBe(15);
    expect(secondsLeft(START, after(5.6))).toBe(9.4);
    expect(secondsLeft(START, after(15))).toBe(0);
    expect(secondsLeft(START, after(60))).toBe(0);
    expect(secondsLeft(START, after(-2))).toBe(15); // clocks slightly off
  });

  it("a round stays open while answers are missing and the time is not up", () => {
    for (const seconds of [0, 14.9, 15]) {
      expect(isRoundClosed({ startedAt: START, answeredCount: 2, playerCount: 3 }, after(seconds))).toBe(false);
    }
  });

  it("a round closes after 15 seconds even if nobody answered", () => {
    expect(isRoundClosed({ startedAt: START, answeredCount: 0, playerCount: 3 }, after(15.001))).toBe(true);
  });

  it("a round closes early when every player has answered", () => {
    expect(isRoundClosed({ startedAt: START, answeredCount: 3, playerCount: 3 }, after(2))).toBe(true);
    expect(isRoundClosed({ startedAt: START, answeredCount: 1, playerCount: 1 }, after(0))).toBe(true);
  });
});

describe("parseRoomAnswerInput", () => {
  it("accepts a round number and one of the four options", () => {
    for (const answer of [0, 1, 2, 3]) {
      expect(parseRoomAnswerInput({ round: 1, answer })).toEqual({ ok: true, round: 1, answer });
    }
  });

  it("rejects options outside 0–3", () => {
    for (const answer of [4, -1, 1.5]) {
      expect(parseRoomAnswerInput({ round: 1, answer })).toEqual({ ok: false, error: "invalid-option" });
    }
  });

  it("rejects 'skip' and 'timeout' – in a room, not answering is simply no answer", () => {
    expect(parseRoomAnswerInput({ round: 1, answer: "skip" })).toEqual({ ok: false, error: "malformed" });
    expect(parseRoomAnswerInput({ round: 1, answer: "timeout" })).toEqual({ ok: false, error: "malformed" });
  });

  it("rejects missing fields, wrong types and round 0", () => {
    for (const body of [null, [], "text", {}, { round: 1 }, { answer: 0 }, { round: "1", answer: 0 }, { round: 1, answer: "2" }, { round: 0, answer: 0 }]) {
      expect(parseRoomAnswerInput(body)).toEqual({ ok: false, error: "malformed" });
    }
  });
});

describe("rankByScore", () => {
  it("sorts by score, highest first", () => {
    const ranked = rankByScore([
      { nickname: "Anna", score: 100 },
      { nickname: "Ben", score: 300 },
      { nickname: "Cleo", score: 200 },
    ]);
    expect(ranked).toEqual([
      { nickname: "Ben", score: 300, rank: 1 },
      { nickname: "Cleo", score: 200, rank: 2 },
      { nickname: "Anna", score: 100, rank: 3 },
    ]);
  });

  it("gives equal scores the same rank and skips the next one (1, 1, 3)", () => {
    const ranked = rankByScore([
      { nickname: "Anna", score: 250 },
      { nickname: "Ben", score: 100 },
      { nickname: "Cleo", score: 250 },
      { nickname: "Dan", score: 100 },
    ]);
    expect(ranked.map((p) => [p.nickname, p.rank])).toEqual([
      ["Anna", 1],
      ["Cleo", 1],
      ["Ben", 3],
      ["Dan", 3],
    ]);
  });

  it("gives everyone rank 1 when all scores are equal, in the order they joined", () => {
    const ranked = rankByScore([
      { nickname: "Anna", score: 0 },
      { nickname: "Ben", score: 0 },
      { nickname: "Cleo", score: 0 },
    ]);
    expect(ranked.map((p) => [p.nickname, p.rank])).toEqual([
      ["Anna", 1],
      ["Ben", 1],
      ["Cleo", 1],
    ]);
  });

  it("handles an empty list and a single player, and does not change the list it was given", () => {
    expect(rankByScore([])).toEqual([]);
    expect(rankByScore([{ nickname: "Anna", score: 0 }])).toEqual([{ nickname: "Anna", score: 0, rank: 1 }]);

    const players = [
      { nickname: "Anna", score: 1 },
      { nickname: "Ben", score: 2 },
    ];
    rankByScore(players);
    expect(players.map((p) => p.nickname)).toEqual(["Anna", "Ben"]);
  });
});

describe("hasRoundStandings", () => {
  it("shows the standings after each round in a Multiplayer game that started with 3 or more players", () => {
    expect(hasRoundStandings({ type: "multiplayer", startingPlayers: 3 })).toBe(true);
    expect(hasRoundStandings({ type: "multiplayer", startingPlayers: 25 })).toBe(true);
  });

  it("shows them in a duel too: a Duel room, or a Multiplayer game that started with 2 players", () => {
    expect(hasRoundStandings({ type: "duel", startingPlayers: 2 })).toBe(true);
    expect(hasRoundStandings({ type: "multiplayer", startingPlayers: 2 })).toBe(true);
  });

  it("does not show them before the game started (no starting players yet)", () => {
    expect(hasRoundStandings({ type: "multiplayer", startingPlayers: null })).toBe(false);
    expect(hasRoundStandings({ type: "multiplayer", startingPlayers: undefined })).toBe(false);
    expect(hasRoundStandings({ type: undefined, startingPlayers: 3 })).toBe(false);
  });
});
