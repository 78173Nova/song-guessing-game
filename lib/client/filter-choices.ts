// Which genre and decade choices the start screen offers (spec 003, "filter gaps"). A combination with fewer playable
// songs than the chosen game has rounds (5 by default) is greyed out. This only helps the player: the server still refuses such a game on its own.
// `counts` is null when they could not be loaded – then nothing is greyed out.
import { DECADES, MIN_MATCHING_SONGS, type Filters, type SongCount } from "../game/filters";
import { GENRE_LABELS, GENRES } from "../game/genres";

// How many songs match the filters. A missing filter ("Any") adds up all genres or all decades.
export function matchingCount(counts: SongCount[], filters: Filters): number {
  return counts
    .filter(
      (c) =>
        (filters.genre === undefined || c.genre === filters.genre) &&
        (filters.decade === undefined || c.decade === filters.decade),
    )
    .reduce((sum, c) => sum + c.count, 0);
}

// True if a game of `rounds` songs with these filters has enough songs – or if the counts are unknown.
export function canChoose(counts: SongCount[] | null, filters: Filters, rounds: number = MIN_MATCHING_SONGS): boolean {
  return counts === null || matchingCount(counts, filters) >= rounds;
}

// The short notes under the genre and decade tiles, saying why some choices are greyed out. None if nothing is.
export function filterNotes(counts: SongCount[] | null, filters: Filters, rounds: number = MIN_MATCHING_SONGS): string[] {
  if (counts === null) return [];
  const notes: string[] = [];
  const { genre, decade } = filters;
  if (genre !== undefined && DECADES.some((d) => !canChoose(counts, { genre, decade: d }, rounds))) {
    notes.push(`Greyed-out decades have fewer than ${rounds} ${GENRE_LABELS[genre]} songs.`);
  }
  if (decade !== undefined && GENRES.some((g) => !canChoose(counts, { genre: g, decade }, rounds))) {
    notes.push(`Greyed-out genres have fewer than ${rounds} songs from the ${decade}s.`);
  }
  return notes;
}
