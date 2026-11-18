// Genre and decade filters (spec 003, decision 013). Plain functions: no database, no network.
import { isGenre, type Genre } from "./genres";

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

// A game needs 5 different songs (5 rounds). A genre + decade with fewer can never start, so the start screen
// greys it out (spec 003, "filter gaps"). The server still refuses it on its own.
export const MIN_MATCHING_SONGS = 5;

// How many songs one genre has in one decade. Only counts – nothing about single songs.
export type SongCount = { genre: string; decade: number; count: number };

// Counts the songs per genre and decade (1989 → 1980). Only combinations with songs are listed, sorted by
// genre, then decade. The 1957 song gets decade 1950, so adding up "Any decade" stays correct.
export function countByGenreAndDecade<T extends { genre: string; year: number }>(songs: T[]): SongCount[] {
  const counts = new Map<string, SongCount>();
  for (const song of songs) {
    const decade = decadeOf(song.year);
    const key = `${song.genre}|${decade}`;
    const entry = counts.get(key) ?? { genre: song.genre, decade, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) =>
    a.genre === b.genre ? a.decade - b.decade : a.genre < b.genre ? -1 : 1,
  );
}

// Reads the filters from a query string: ?genre=rock&decade=1980, each one at most once. Missing = "Any".
// Anything else (another field, an unknown genre, "1985") is refused.
export type ParsedFiltersQuery =
  | { ok: true; filters: Filters }
  | { ok: false; error: "malformed" | "invalid-genre" | "invalid-decade" };

export function parseFiltersQuery(params: URLSearchParams): ParsedFiltersQuery {
  for (const key of params.keys()) {
    if ((key !== "genre" && key !== "decade") || params.getAll(key).length > 1) return { ok: false, error: "malformed" };
  }
  const genre = params.get("genre");
  const decadeText = params.get("decade");
  if (genre !== null && !isGenre(genre)) return { ok: false, error: "invalid-genre" };
  const decade = decadeText !== null && /^[0-9]{4}$/.test(decadeText) ? Number(decadeText) : decadeText;
  if (decade !== null && !isDecade(decade)) return { ok: false, error: "invalid-decade" };
  return {
    ok: true,
    filters: { ...(genre === null ? {} : { genre }), ...(decade === null ? {} : { decade }) },
  };
}
