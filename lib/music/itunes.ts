// The only place in the app that calls the iTunes Search API (CLAUDE.md rule 7, decision 006).
// It never throws: every problem comes back as { ok: false, reason, message }.
import type { PreviewData } from "../db/songs";

export const MUSIC_UNAVAILABLE_MESSAGE =
  "The music source is not reachable right now. Please try again in a moment.";
export const PREVIEW_NOT_FOUND_MESSAGE = "No preview was found for this song.";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const DEFAULT_TIMEOUT_MS = 5000;

export type PreviewLookup =
  | ({ ok: true } & PreviewData)
  | { ok: false; reason: "unavailable" | "not-found"; message: string };

export type SongToLookUp = { artist: string; title: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type LookupOptions = {
  fetchFn?: FetchFn; // tests pass a fake; the app uses the real fetch
  timeoutMs?: number;
};

// Searches the US store for the song and returns the preview of the best matching track.
export async function lookupPreview(song: SongToLookUp, options: LookupOptions = {}): Promise<PreviewLookup> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url = new URL(ITUNES_SEARCH_URL);
  url.searchParams.set("term", `${song.artist} ${song.title}`);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("country", "US");
  url.searchParams.set("limit", "25");

  let body: unknown;
  try {
    // The signal cancels the request when the time is up (timeout, error code, network error → unavailable).
    const response = await fetchFn(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return unavailable();
    body = await response.json();
  } catch {
    return unavailable();
  }

  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return unavailable();

  for (const result of results) {
    const preview = matchingPreview(song, result);
    if (preview) return { ok: true, ...preview };
  }
  return { ok: false, reason: "not-found", message: PREVIEW_NOT_FOUND_MESSAGE };
}

function unavailable(): PreviewLookup {
  return { ok: false, reason: "unavailable", message: MUSIC_UNAVAILABLE_MESSAGE };
}

// Returns the preview data if this iTunes result is the song we want, otherwise null.
function matchingPreview(song: SongToLookUp, result: unknown): PreviewData | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  const { artistName, trackName, previewUrl, artworkUrl100, trackViewUrl } = r;
  const collectionName = typeof r.collectionName === "string" ? r.collectionName : "";

  if (typeof artistName !== "string" || typeof trackName !== "string") return null;
  if (typeof previewUrl !== "string" || previewUrl === "") return null;
  if (!artistMatches(song.artist, artistName)) return null;
  if (cleanTitle(trackName) !== cleanTitle(song.title)) return null;
  if (isUnwantedVersion(song.title, trackName, collectionName)) return null;

  return {
    previewUrl,
    // The small cover (100×100) can be turned into a large one by changing the size in the URL.
    artworkUrl: typeof artworkUrl100 === "string" ? artworkUrl100.replace("100x100bb", "600x600bb") : "",
    storeUrl: typeof trackViewUrl === "string" ? trackViewUrl : "",
  };
}

// Lowercase, no accents ("Beyoncé" = "beyonce"), only letters and digits separated by single spaces.
function cleanText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Like cleanText, but also drops extras: anything in brackets ("(feat. Bruno Mars)", "[Remastered]")
// and anything after " - " ("- Remastered 2011").
function cleanTitle(title: string): string {
  return cleanText(title.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+-\s+.*$/, ""));
}

// Same artist, or our artist followed by a partner ("Daft Punk & Pharrell Williams", "Eminem feat. ...").
// "Daft Punk Tribute Band" does not count.
function artistMatches(ours: string, theirs: string): boolean {
  const wanted = cleanText(ours);
  if (cleanText(theirs) === wanted) return true;
  const mainArtist = theirs.split(/\s*(?:&|,|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b)\s*/i)[0];
  return cleanText(mainArtist) === wanted;
}

const UNWANTED_WORDS = [/\bkaraoke\b/i, /\blive\b/i, /\bremix(?:es|ed)?\b/i];

// Karaoke, live and remix versions are skipped – unless the word is part of the real title.
function isUnwantedVersion(ourTitle: string, trackName: string, collectionName: string): boolean {
  return UNWANTED_WORDS.some(
    (word) => !word.test(ourTitle) && (word.test(trackName) || word.test(collectionName)),
  );
}
