// Game modes (spec 003, decision 013): what the player guesses. Plain functions: no database, no network.

// The modes a player can choose. "mixed" picks one of the question types at random for each round.
export const MODES = ["title", "artist", "year", "mixed"] as const;
export type Mode = (typeof MODES)[number];

// What one round asks. Every round has exactly one of these (a mixed game mixes them).
export const QUESTION_TYPES = ["title", "artist", "year"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// The question the round screen shows.
export const QUESTION_LABELS: Record<QuestionType, string> = {
  title: "Which song?",
  artist: "Who sings this?",
  year: "Which year?",
};

// True only for an exact mode from the list (no other spelling, no extra spaces, no other types).
export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export type ParsedStart = { ok: true; mode: Mode } | { ok: false; error: "malformed" | "invalid-mode" };

// Checks the body of POST /api/games. No body or no mode = title mode, so older screens keep working.
// Only "mode" is allowed: anything else (also genre and decade, until the filters are built) is refused.
export function parseStartInput(body: unknown): ParsedStart {
  if (body === undefined) return { ok: true, mode: "title" };
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "malformed" };

  const fields = Object.keys(body);
  if (fields.some((field) => field !== "mode")) return { ok: false, error: "malformed" };

  const { mode } = body as Record<string, unknown>;
  if (mode === undefined) return { ok: true, mode: "title" };
  if (typeof mode !== "string") return { ok: false, error: "malformed" };
  if (!isMode(mode)) return { ok: false, error: "invalid-mode" };
  return { ok: true, mode };
}

// Rules for the wrong years in year mode (spec 003).
export const EARLIEST_YEAR = 1950;
const MAX_DISTANCE = 10; // every wrong year is at most 10 years away from the correct one
const MIN_GAP = 2; // all 4 years are at least 2 years apart from each other

// 3 wrong years for `correctYear`: calculated, not taken from other songs, so year mode always works.
// None after `currentYear`, none before 1950. null = the rules cannot be met (only for impossible data,
// e.g. a song year in the future).
export function wrongYears(correctYear: number, currentYear: number, random: () => number): number[] | null {
  const first = Math.max(EARLIEST_YEAR, correctYear - MAX_DISTANCE);
  const last = Math.min(currentYear, correctYear + MAX_DISTANCE);
  const candidates: number[] = [];
  for (let year = first; year <= last; year++) {
    if (Math.abs(year - correctYear) >= MIN_GAP) candidates.push(year);
  }

  // Take candidates in random order, skipping any too close to one already taken.
  // Each year taken blocks at most 3 candidates (itself and its two neighbours), and there are always at
  // least 9 candidates for a song year from 1950 to the current year, so 3 years are always found.
  const chosen: number[] = [];
  const remaining = [...candidates];
  while (chosen.length < 3 && remaining.length > 0) {
    const [year] = remaining.splice(Math.floor(random() * remaining.length), 1);
    if (chosen.every((other) => Math.abs(other - year) >= MIN_GAP)) chosen.push(year);
  }
  return chosen.length === 3 ? chosen : null;
}
