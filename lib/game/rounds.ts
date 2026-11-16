// Building a game: which songs are played and which 4 options each round shows.
// The options are titles, artists or years, depending on the round's question type (spec 003).
import { QUESTION_TYPES, wrongYears, type Mode, type QuestionType } from "./modes";

export const ROUNDS_PER_GAME = 5;
export const OPTIONS_PER_ROUND = 4;

// Artist and year are only needed for artist and year questions.
export type SongForGame = { id: number; title: string; artist?: string; year?: number };

export type NewRound = {
  roundNumber: number; // 1, 2, 3, ...
  songId: number; // the correct song
  options: string[]; // 4 titles, artists or years in the order the browser shows them
  correctOption: number; // position of the correct option in `options` (0–3)
  questionType?: QuestionType; // what the round asks; missing = title
};

export type BuildResult = { ok: true; rounds: NewRound[] } | { ok: false; reason: "not-enough-songs" };

// `currentYear` is passed in by the server (and fixed in tests), so wrong years never lie in the future.
export type BuildSettings = { mode?: Mode; currentYear?: number };

// Options that differ only in upper/lower case or spaces count as the same ("Queen" = "queen").
function optionKey(text: string): string {
  return text.trim().toLowerCase();
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

// What a song shows as an option for a question type (empty if the song does not have it).
function optionOf(song: SongForGame, type: QuestionType): string {
  if (type === "artist") return song.artist ?? "";
  if (type === "year") return song.year === undefined ? "" : String(song.year);
  return song.title;
}

// How many different options of this type the songs give (ignoring upper/lower case).
function differentOptions(songs: SongForGame[], type: QuestionType): number {
  return new Set(songs.map((s) => optionKey(optionOf(s, type))).filter((key) => key !== "")).size;
}

// Title and artist rounds need 4 different titles / artists among the songs. Year rounds always work:
// their wrong years are calculated.
function canAsk(songs: SongForGame[], type: QuestionType): boolean {
  return type === "year" || differentOptions(songs, type) >= OPTIONS_PER_ROUND;
}

// The question types a mode can use.
function typesFor(mode: Mode): readonly QuestionType[] {
  return mode === "mixed" ? QUESTION_TYPES : [mode];
}

// Picks ROUNDS_PER_GAME different songs and gives each round 1 correct + 3 wrong options, shuffled.
// Mixed mode picks the question type of each round at random.
export function buildRounds(
  songs: SongForGame[],
  random: () => number = Math.random,
  settings: BuildSettings = {},
): BuildResult {
  const mode = settings.mode ?? "title";
  const currentYear = settings.currentYear ?? new Date().getFullYear();
  if (songs.length < ROUNDS_PER_GAME || !typesFor(mode).every((type) => canAsk(songs, type))) {
    return { ok: false, reason: "not-enough-songs" };
  }

  const chosen = shuffle(songs, random).slice(0, ROUNDS_PER_GAME);
  const rounds: NewRound[] = [];
  for (const [index, song] of chosen.entries()) {
    const types = typesFor(mode);
    // Only mixed mode draws a random number here, so title games are built exactly as before.
    const type = types.length === 1 ? types[0] : types[Math.floor(random() * types.length)];
    const round = roundFor(song, index + 1, type, songs, random, currentYear);
    if (round === null) return { ok: false, reason: "not-enough-songs" };
    rounds.push(round);
  }
  return { ok: true, rounds };
}

// One round for `song`: the correct option plus 3 different wrong ones, shuffled. null = not possible
// (a song without the artist or year the question needs).
function roundFor(
  song: SongForGame,
  roundNumber: number,
  type: QuestionType,
  songs: SongForGame[],
  random: () => number,
  currentYear: number,
): NewRound | null {
  const correct = optionOf(song, type);
  if (correct === "") return null;

  let wrong: string[];
  if (type === "year") {
    const years = wrongYears(song.year!, currentYear, random);
    if (years === null) return null;
    wrong = years.map(String);
  } else {
    // Wrong titles / artists come from other songs and never repeat the correct one or each other
    // (two songs called "Happy", two songs by Queen).
    const used = new Set([optionKey(correct)]);
    wrong = [];
    for (const other of shuffle(songs, random)) {
      if (wrong.length === OPTIONS_PER_ROUND - 1) break;
      const option = optionOf(other, type);
      if (option === "" || used.has(optionKey(option))) continue;
      used.add(optionKey(option));
      wrong.push(option);
    }
  }

  const options = shuffle([correct, ...wrong], random);
  return { roundNumber, songId: song.id, options, correctOption: options.indexOf(correct), questionType: type };
}

export type ReplacementResult = { ok: true; round: NewRound } | { ok: false; reason: "not-enough-songs" };

export type ReplacementSettings = { questionType?: QuestionType; currentYear?: number };

// A new song for a round whose clip would not load: a song that is not in the game yet, with 4 new
// options of the same question type. `songIdsInGame` are the songs the game already uses (including the
// one replaced).
export function buildReplacementRound(
  songs: SongForGame[],
  songIdsInGame: number[],
  roundNumber: number,
  random: () => number = Math.random,
  settings: ReplacementSettings = {},
): ReplacementResult {
  const type = settings.questionType ?? "title";
  const currentYear = settings.currentYear ?? new Date().getFullYear();
  const unused = songs.filter((s) => !songIdsInGame.includes(s.id));
  if (unused.length === 0 || !canAsk(songs, type)) {
    return { ok: false, reason: "not-enough-songs" };
  }
  const song = shuffle(unused, random)[0];
  const round = roundFor(song, roundNumber, type, songs, random, currentYear);
  return round === null ? { ok: false, reason: "not-enough-songs" } : { ok: true, round };
}
