// Getting clips ready before their round starts (decision 006 and 011, updates).
// Plain functions: the screen code passes in how to load a clip and how to ask for a replacement.

export const UNSUPPORTED_BROWSER_MESSAGE =
  "Your browser can't play these previews – please open the game in Chrome, Safari or Firefox.";
export const MUSIC_LOAD_MESSAGE =
  "The music can't be loaded right now – please check your connection and try again.";

// Apple's previews are AAC audio in an MP4 container.
const PREVIEW_TYPE = 'audio/mp4; codecs="mp4a.40.2"';

// `canPlayType` is the browser's audio.canPlayType: "" means "cannot play this at all".
export function canPlayPreviews(canPlayType: (type: string) => string): boolean {
  return canPlayType(PREVIEW_TYPE) !== "";
}

export const MAX_REPLACEMENTS = 3;

export type LoadClip = (url: string) => Promise<boolean>; // true = ready to play to the end
export type ReplaceClip = () => Promise<string | null>; // the new song's clip, or null if there is none

// Load → on failure try the same clip once more → still failing: swap the song (up to 3 times) → give up.
export async function prepareClip(
  url: string,
  load: LoadClip,
  replace: ReplaceClip,
): Promise<{ ok: true; url: string } | { ok: false }> {
  let current = url;
  for (let swaps = 0; ; swaps++) {
    if (await load(current)) return { ok: true, url: current };
    if (await load(current)) return { ok: true, url: current };
    if (swaps === MAX_REPLACEMENTS) return { ok: false };
    const next = await replace();
    if (next === null) return { ok: false };
    current = next;
  }
}

// Resolves with `fallback` if `promise` takes longer than `ms`.
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}
