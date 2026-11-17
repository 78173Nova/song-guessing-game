import { describe, expect, it } from "vitest";
import {
  COPY_FAILED_MESSAGE,
  copyLink,
  markShareOnArrival,
  roomJoinLink,
  takeShareOnArrival,
  type KeyValueStorage,
} from "@/lib/client/share";

describe("roomJoinLink", () => {
  it("builds the join link from the app's configured address and the room code", () => {
    expect(roomJoinLink("https://songs.example.com", "482913")).toBe("https://songs.example.com/join/482913");
  });

  it("does not double the slash when the address ends with one", () => {
    expect(roomJoinLink("http://localhost:3000/", "482913")).toBe("http://localhost:3000/join/482913");
  });
});

// A stand-in for the browser's sessionStorage.
function fakeStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

// Storage that refuses every access, like a browser in strict private mode.
const blockedStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("opening the share pop-up after creating a room", () => {
  it("opens it once on arriving in the room just created", () => {
    const storage = fakeStorage();
    markShareOnArrival("482913", storage);
    expect(takeShareOnArrival("482913", storage)).toBe(true);
  });

  it("does not open it again after a reload of the lobby", () => {
    const storage = fakeStorage();
    markShareOnArrival("482913", storage);
    takeShareOnArrival("482913", storage);
    expect(takeShareOnArrival("482913", storage)).toBe(false);
  });

  it("does not open it for someone who arrives by a shared link", () => {
    expect(takeShareOnArrival("482913", fakeStorage())).toBe(false);
  });

  it("does not open it in a different room", () => {
    const storage = fakeStorage();
    markShareOnArrival("482913", storage);
    expect(takeShareOnArrival("731405", storage)).toBe(false);
  });

  it("keeps working when the browser blocks storage (the pop-up then simply stays closed)", () => {
    expect(() => markShareOnArrival("482913", blockedStorage)).not.toThrow();
    expect(takeShareOnArrival("482913", blockedStorage)).toBe(false);
  });
});

describe("copyLink", () => {
  it("puts the link on the clipboard", async () => {
    const copied: string[] = [];
    const clipboard = { writeText: async (text: string) => void copied.push(text) };
    const result = await copyLink("https://songs.example.com/join/482913", clipboard);
    expect(result).toEqual({ ok: true });
    expect(copied).toEqual(["https://songs.example.com/join/482913"]);
  });

  it("says so when the browser refuses (the link stays visible to copy by hand)", async () => {
    const clipboard = { writeText: async () => Promise.reject(new DOMException("denied", "NotAllowedError")) };
    expect(await copyLink("https://songs.example.com/join/482913", clipboard)).toEqual({
      ok: false,
      message: COPY_FAILED_MESSAGE,
    });
  });

  it("says so when the browser has no clipboard at all (e.g. a page not served over https)", async () => {
    expect(await copyLink("https://songs.example.com/join/482913", undefined)).toEqual({
      ok: false,
      message: COPY_FAILED_MESSAGE,
    });
  });
});
