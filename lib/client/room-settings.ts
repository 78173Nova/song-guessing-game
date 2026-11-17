// The genre and decade tiles of "Create a room" (issue #34), as plain functions. No browser, no network.
// A choice is "any" (only the "Any" tile is selected) or a list of the selected specific tiles.
export type TileChoice<T> = "any" | T[];

export function isTileSelected<T>(choice: TileChoice<T>, tile: "any" | T): boolean {
  return tile === "any" ? choice === "any" : choice !== "any" && choice.includes(tile);
}

// Tapping "Any" selects only "Any". Tapping a specific tile unselects "Any" and adds or removes that tile.
// Unselecting the last specific tile goes back to "Any", so something is always selected.
export function toggleTile<T>(choice: TileChoice<T>, tile: "any" | T): TileChoice<T> {
  if (tile === "any") return "any";
  if (choice === "any") return [tile];
  if (!choice.includes(tile)) return [...choice, tile];
  const rest = choice.filter((item) => item !== tile);
  return rest.length === 0 ? "any" : rest;
}
