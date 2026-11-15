// The fixed list of genres (spec 003). This is the only place genres are defined:
// the song list, the server's input checks and the start screen all use it.
export const GENRES = ["pop", "rock", "hip-hop", "r&b", "dance", "country"] as const;

export type Genre = (typeof GENRES)[number];

// The names the screen shows. Some genres include neighbours (soul, disco, electronic, folk).
export const GENRE_LABELS: Record<Genre, string> = {
  pop: "Pop",
  rock: "Rock",
  "hip-hop": "Hip-hop",
  "r&b": "R&B / Soul",
  dance: "Dance / Electronic",
  country: "Country / Folk",
};

// True only for an exact genre from the list (no other spelling, no extra spaces, no other types).
export function isGenre(value: unknown): value is Genre {
  return typeof value === "string" && (GENRES as readonly string[]).includes(value);
}
