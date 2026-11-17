import { describe, expect, it } from "vitest";
import { isTileSelected, toggleTile } from "@/lib/client/room-settings";

// The genre and decade tiles of "Create a room" (issue #34): "Any" is selected by default, a specific tile
// unselects "Any".
describe("toggleTile – genre and decade tiles", () => {
  it("starts with only 'Any' selected", () => {
    expect(isTileSelected("any", "any")).toBe(true);
    expect(isTileSelected("any", "pop")).toBe(false);
  });

  it("tapping a specific tile unselects 'Any' and selects that tile", () => {
    const choice = toggleTile("any", "pop");
    expect(choice).toEqual(["pop"]);
    expect(isTileSelected(choice, "any")).toBe(false);
    expect(isTileSelected(choice, "pop")).toBe(true);
  });

  it("adds and removes specific tiles", () => {
    expect(toggleTile(["pop"], "rock")).toEqual(["pop", "rock"]);
    expect(toggleTile(["pop", "rock"], "pop")).toEqual(["rock"]);
    expect(toggleTile([1980, 1990], 1990)).toEqual([1980]);
  });

  it("goes back to 'Any' when the last specific tile is unselected", () => {
    expect(toggleTile(["pop"], "pop")).toBe("any");
  });

  it("tapping 'Any' unselects every specific tile", () => {
    expect(toggleTile(["pop", "rock"], "any")).toBe("any");
    expect(toggleTile("any", "any")).toBe("any");
  });
});
