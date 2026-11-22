// How long a game can be: the same choices for a room and for a solo game. Plain values: no database, no network.
export const SONGS_PER_SET_CHOICES = [3, 5, 10] as const;
export const SET_CHOICES = [1, 2, 3] as const;

export type SongsPerSet = (typeof SONGS_PER_SET_CHOICES)[number];
export type SetCount = (typeof SET_CHOICES)[number];

export function isSongsPerSet(value: unknown): value is SongsPerSet {
  return (SONGS_PER_SET_CHOICES as readonly unknown[]).includes(value);
}

export function isSetCount(value: unknown): value is SetCount {
  return (SET_CHOICES as readonly unknown[]).includes(value);
}
