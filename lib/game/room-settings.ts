// Room settings (issue #34): chosen by the room creator when creating a room, fixed afterwards.
// Plain functions: no database, no network.
import { DECADES, decadeOf, type Decade } from "./filters";
import { GENRES, type Genre } from "./genres";
import { isMode, type Mode } from "./modes";

export const ROOM_TYPES = ["duel", "multiplayer"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const SONGS_PER_SET_CHOICES = [3, 5, 10] as const;
export const SET_CHOICES = [1, 2, 3] as const;

// "any" = every genre (or decade). Otherwise a list of at least one, each at most once.
export type RoomSettings = {
  type: RoomType;
  mode: Mode;
  genres: "any" | Genre[];
  decades: "any" | Decade[];
  songsPerSet: (typeof SONGS_PER_SET_CHOICES)[number];
  sets: (typeof SET_CHOICES)[number];
};

// A room created without settings (older screens, the tests of #32/#33) plays this.
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  type: "multiplayer",
  mode: "title",
  genres: "any",
  decades: "any",
  songsPerSet: 5,
  sets: 1,
};

// How many players a room holds. A full room starts its game by itself.
export const MAX_PLAYERS_BY_TYPE: Record<RoomType, number> = { duel: 2, multiplayer: 25 };

const FIELDS = ["type", "mode", "genres", "decades", "songsPerSet", "sets"];

// "any", or a non-empty list of allowed values without repeats. null = not allowed.
function parseChoice<T>(value: unknown, allowed: readonly T[]): "any" | T[] | null {
  if (value === "any") return "any";
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((item) => allowed.includes(item as T))) return null;
  if (new Set(value).size !== value.length) return null;
  return value as T[];
}

// Checks the settings a browser sent. Every field is required; unknown fields, other types and other values are
// refused. null = not allowed.
export function parseRoomSettings(value: unknown): RoomSettings | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fields = Object.keys(value);
  if (fields.length !== FIELDS.length || !FIELDS.every((field) => fields.includes(field))) return null;

  const { type, mode, genres, decades, songsPerSet, sets } = value as Record<string, unknown>;
  if (!(ROOM_TYPES as readonly unknown[]).includes(type)) return null;
  if (!isMode(mode)) return null;
  const parsedGenres = parseChoice(genres, GENRES);
  const parsedDecades = parseChoice(decades, DECADES);
  if (parsedGenres === null || parsedDecades === null) return null;
  if (!(SONGS_PER_SET_CHOICES as readonly unknown[]).includes(songsPerSet)) return null;
  if (!(SET_CHOICES as readonly unknown[]).includes(sets)) return null;

  return {
    type: type as RoomType,
    mode,
    genres: parsedGenres,
    decades: parsedDecades,
    songsPerSet: songsPerSet as RoomSettings["songsPerSet"],
    sets: sets as RoomSettings["sets"],
  };
}

// Reads genres and decades from a query string: "any" or a comma-separated list ("pop,rock", "1980,1990").
// null = missing or not allowed.
export function parseSongChoiceQuery(
  params: URLSearchParams,
): Pick<RoomSettings, "genres" | "decades"> | null {
  const genres = params.get("genres");
  const decades = params.get("decades");
  if (genres === null || decades === null) return null;
  const parsedGenres = parseChoice(genres === "any" ? "any" : genres.split(","), GENRES);
  const parsedDecades = parseChoice(
    decades === "any" ? "any" : decades.split(",").map((text) => (/^[0-9]{4}$/.test(text) ? Number(text) : text)),
    DECADES,
  );
  if (parsedGenres === null || parsedDecades === null) return null;
  return { genres: parsedGenres, decades: parsedDecades };
}

export const totalRoundsOf = (settings: Pick<RoomSettings, "songsPerSet" | "sets">) =>
  settings.songsPerSet * settings.sets;

// The set a round belongs to: rounds 1–5 are set 1 with 5 songs per set, 6–10 set 2, ...
export const setOfRound = (round: number, songsPerSet: number) => Math.ceil(round / songsPerSet);

// Is this round the last of its set? Then the set summary and the standings come before the next round.
export const endsSet = (round: number, songsPerSet: number) => round % songsPerSet === 0;

// The songs that match one of the chosen genres and one of the chosen decades.
export function matchingSongs<T extends { genre: string; year: number }>(
  songs: T[],
  choice: Pick<RoomSettings, "genres" | "decades">,
): T[] {
  return songs.filter(
    (song) =>
      (choice.genres === "any" || (choice.genres as string[]).includes(song.genre)) &&
      (choice.decades === "any" || (choice.decades as number[]).includes(decadeOf(song.year))),
  );
}

// The message when a room cannot be created with these settings.
export function tooFewRoomSongsMessage(matching: number): string {
  if (matching === 0) return "No songs match. Choose more genres/decades.";
  if (matching === 1) return "Only 1 song matches. Choose fewer songs or more genres/decades.";
  return `Only ${matching} songs match. Choose fewer songs or more genres/decades.`;
}
