// Genre and decade filters (spec 003, decision 013). Plain functions: no database, no network.
import type { Genre } from "./genres";

// The decades a player can choose. There is no 1950s filter: the one 1957 song only plays with "Any".
export const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;
export type Decade = (typeof DECADES)[number];

// What the player chose before the game. A missing filter means "Any".
export type Filters = { genre?: Genre; decade?: Decade };

// True only for one of the 7 decades, as a number (not "1980", not 1985).
export function isDecade(value: unknown): value is Decade {
  return typeof value === "number" && (DECADES as readonly number[]).includes(value);
}

// The decade is calculated from the year, there is no decade column (decision 005): 1987 → 1980.
export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

// The songs that match both filters. With no filters, every song.
export function filterSongs<T extends { genre: string; year: number }>(songs: T[], filters: Filters): T[] {
  return songs.filter(
    (song) =>
      (filters.genre === undefined || song.genre === filters.genre) &&
      (filters.decade === undefined || decadeOf(song.year) === filters.decade),
  );
}

// True if the player chose at least one filter.
export function hasFilters(filters: Filters): boolean {
  return filters.genre !== undefined || filters.decade !== undefined;
}

// The message when a game cannot start with these filters. `matching` = how many playable songs match.
// With 5 or more, the songs are too alike for the mode (e.g. all by one artist in artist mode).
export function tooFewSongsMessage(matching: number): string {
  const hint = "try 'Any' for genre or decade";
  if (matching === 0) return `No songs match these filters – ${hint}.`;
  if (matching === 1) return `Only 1 song matches these filters – ${hint}.`;
  if (matching < 5) return `Only ${matching} songs match these filters – ${hint}.`;
  return `These filters match too few different titles or artists for this mode – ${hint}, or another mode.`;
}
