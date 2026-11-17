import { describe, expect, it } from "vitest";
import { AVATARS, avatarEmoji, DEFAULT_AVATAR, isAvatar, randomAvatar } from "@/lib/game/avatars";

// The fixed set of avatars (issue #44): ids the server stores, emoji the page shows.
describe("avatars", () => {
  it("has 16 avatars with different ids and different emoji, the default among them", () => {
    expect(AVATARS).toHaveLength(16);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(16);
    expect(new Set(AVATARS.map((a) => a.emoji)).size).toBe(16);
    expect(isAvatar(DEFAULT_AVATAR)).toBe(true);
  });

  it("accepts only the ids of the set", () => {
    expect(isAvatar("fox")).toBe(true);
    for (const value of ["Fox", "🦊", "", " fox", "dragon", 1, null, undefined, {}, ["fox"]]) {
      expect(isAvatar(value)).toBe(false);
    }
  });

  it("shows the emoji of an id, and the music note for an unknown one", () => {
    expect(avatarEmoji("fox")).toBe("🦊");
    expect(avatarEmoji("dragon")).toBe("🎵");
    expect(avatarEmoji(undefined)).toBe("🎵");
  });

  it("picks a random avatar of the set, from the first to the last", () => {
    expect(randomAvatar(() => 0)).toBe("fox");
    expect(randomAvatar(() => 0.5)).toBe(AVATARS[8].id);
    expect(randomAvatar(() => 0.9999)).toBe("note");
  });
});
