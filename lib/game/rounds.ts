// Building a game: which songs are played and which 4 titles each round shows.
export const ROUNDS_PER_GAME = 5;
export const OPTIONS_PER_ROUND = 4;

export type SongForGame = { id: number; title: string };

export type NewRound = {
  roundNumber: number; // 1, 2, 3, ...
  songId: number; // the correct song
  options: string[]; // 4 titles in the order the browser shows them
  correctOption: number; // position of the correct title in `options` (0–3)
};

export type BuildResult = { ok: true; rounds: NewRound[] } | { ok: false; reason: "not-enough-songs" };

// Titles that differ only in upper/lower case or spaces count as the same title.
function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

// Fisher–Yates shuffle: every order is equally likely. Returns a new array.
function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Picks ROUNDS_PER_GAME different songs and gives each round 1 correct + 3 wrong titles, shuffled.
// Wrong titles come from other songs and never repeat the correct title (two songs called "Happy").
export function buildRounds(songs: SongForGame[], random: () => number = Math.random): BuildResult {
  const differentTitles = new Set(songs.map((s) => titleKey(s.title))).size;
  if (songs.length < ROUNDS_PER_GAME || differentTitles < OPTIONS_PER_ROUND) {
    return { ok: false, reason: "not-enough-songs" };
  }

  const chosen = shuffle(songs, random).slice(0, ROUNDS_PER_GAME);
  const rounds = chosen.map((song, index) => roundFor(song, index + 1, songs, random));
  return { ok: true, rounds };
}

// One round for `song`: its title plus 3 different wrong titles from the other songs, shuffled.
function roundFor(song: SongForGame, roundNumber: number, songs: SongForGame[], random: () => number): NewRound {
  const usedTitles = new Set([titleKey(song.title)]);
  const wrongTitles: string[] = [];
  for (const other of shuffle(songs, random)) {
    if (wrongTitles.length === OPTIONS_PER_ROUND - 1) break;
    if (usedTitles.has(titleKey(other.title))) continue;
    usedTitles.add(titleKey(other.title));
    wrongTitles.push(other.title);
  }

  const options = shuffle([song.title, ...wrongTitles], random);
  return { roundNumber, songId: song.id, options, correctOption: options.indexOf(song.title) };
}

export type ReplacementResult = { ok: true; round: NewRound } | { ok: false; reason: "not-enough-songs" };

// A new song for a round whose clip would not load: a song that is not in the game yet,
// with 4 new options. `songIdsInGame` are the songs the game already uses (including the one replaced).
export function buildReplacementRound(
  songs: SongForGame[],
  songIdsInGame: number[],
  roundNumber: number,
  random: () => number = Math.random,
): ReplacementResult {
  const unused = songs.filter((s) => !songIdsInGame.includes(s.id));
  const differentTitles = new Set(songs.map((s) => titleKey(s.title))).size;
  if (unused.length === 0 || differentTitles < OPTIONS_PER_ROUND) {
    return { ok: false, reason: "not-enough-songs" };
  }
  const song = shuffle(unused, random)[0];
  return { ok: true, round: roundFor(song, roundNumber, songs, random) };
}
