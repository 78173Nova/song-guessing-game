// The solo start screen as tiles (team feedback 18 Nov, points 7 and 8), as plain functions. Single choice: one
// genre and one decade, "Any" by default. `counts` = the three numbers for the chosen genre + decade, or null while
// they load or when loading failed: then nothing is blocked. This only helps the player: the server refuses every
// game that cannot start on its own.
import { DECADES, MIN_MATCHING_SONGS, tooFewSongsMessage, type Decade } from "../game/filters";
import { GENRES, type Genre } from "../game/genres";
import type { Mode } from "../game/modes";
import { modeFits, OPTIONS_PER_ROUND, type MatchingCounts } from "../game/rounds";
import { MODE_LABELS } from "./room-list";

// A tile's value → the filter. "any" (or anything that is not a tile) = no filter.
export function genreFromTile(value: string): Genre | undefined {
  return GENRES.find((genre) => genre === value);
}

export function decadeFromTile(value: string): Decade | undefined {
  return DECADES.find((decade) => String(decade) === value);
}

// The warning above "Start game" when fewer than 5 songs match: shown as an error, Start is disabled.
// null = nothing to show (enough songs, or the numbers are not loaded): the number of matching songs is not shown.
export function matchLine(counts: MatchingCounts | null): string | null {
  if (counts === null || counts.songs >= MIN_MATCHING_SONGS) return null;
  return tooFewSongsMessage(counts.songs);
}

// With fewer than 5 songs the filters are the problem (the match line says so), not the mode.
const modesMatter = (counts: MatchingCounts | null): counts is MatchingCounts =>
  counts !== null && counts.songs >= MIN_MATCHING_SONGS;

// False = the mode tile is greyed out.
export function canPickMode(counts: MatchingCounts | null, mode: Mode): boolean {
  return !modesMatter(counts) || modeFits(counts, mode);
}

// What is missing: titles before artists (mixed needs both). null = nothing.
function shortOf(counts: MatchingCounts, mode: Mode): { what: string; have: number } | null {
  if ((mode === "title" || mode === "mixed") && counts.titles < OPTIONS_PER_ROUND) return { what: "titles", have: counts.titles };
  if ((mode === "artist" || mode === "mixed") && counts.artists < OPTIONS_PER_ROUND) return { what: "artists", have: counts.artists };
  return null;
}

// The short notes under the mode tiles, saying why some are greyed out. None if nothing is.
export function modeNotes(counts: MatchingCounts | null): string[] {
  if (!modesMatter(counts)) return [];
  const notes: string[] = [];
  if (counts.titles < OPTIONS_PER_ROUND) {
    notes.push(`Title and Mixed need ${OPTIONS_PER_ROUND} different titles – these filters have only ${counts.titles}.`);
  }
  if (counts.artists < OPTIONS_PER_ROUND) {
    notes.push(`Artist and Mixed need ${OPTIONS_PER_ROUND} different artists – these filters have only ${counts.artists}.`);
  }
  return notes;
}

// The chosen mode stopped working after a filter change: it stays chosen (greyed out), "Start game" is disabled
// and this line says why. null = the mode works (or the match line already explains the problem).
export function modeProblem(counts: MatchingCounts | null, mode: Mode): string | null {
  if (!modesMatter(counts)) return null;
  const short = shortOf(counts, mode);
  if (short === null) return null;
  return (
    `${MODE_LABELS[mode]} needs ${OPTIONS_PER_ROUND} different ${short.what} – these filters have only ${short.have}. ` +
    "Choose another mode or other filters."
  );
}
