import { describe, expect, it, vi } from "vitest";
import {
  lookupPreview,
  MUSIC_UNAVAILABLE_MESSAGE,
  PREVIEW_NOT_FOUND_MESSAGE,
} from "@/lib/music/itunes";

// These tests never call the real iTunes API (CLAUDE.md rule 8): `fetch` is replaced by a fake.

type FakeTrack = {
  artistName: string;
  trackName: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
};

function track(artistName: string, trackName: string, extra: Partial<FakeTrack> = {}): FakeTrack {
  const id = `${artistName}-${trackName}`.replace(/\W+/g, "-");
  return {
    artistName,
    trackName,
    collectionName: "Greatest Hits",
    previewUrl: `https://audio.example.com/${id}.m4a`,
    artworkUrl100: `https://art.example.com/${id}/100x100bb.jpg`,
    trackViewUrl: `https://music.example.com/${id}`,
    ...extra,
  };
}

// A fake fetch that answers every request with the given iTunes results.
function fakeItunes(results: FakeTrack[]) {
  return vi.fn<(url: string) => Promise<Response>>(async () => {
    return new Response(JSON.stringify({ resultCount: results.length, results }), { status: 200 });
  });
}

describe("lookupPreview – success", () => {
  it("returns preview, large artwork and store link, and searches the US store for songs", async () => {
    const fetchFn = fakeItunes([track("Queen", "Bohemian Rhapsody")]);

    const result = await lookupPreview({ artist: "Queen", title: "Bohemian Rhapsody" }, { fetchFn });

    expect(result).toEqual({
      ok: true,
      previewUrl: "https://audio.example.com/Queen-Bohemian-Rhapsody.m4a",
      artworkUrl: "https://art.example.com/Queen-Bohemian-Rhapsody/600x600bb.jpg",
      storeUrl: "https://music.example.com/Queen-Bohemian-Rhapsody",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchFn.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://itunes.apple.com/search");
    expect(url.searchParams.get("country")).toBe("US");
    expect(url.searchParams.get("media")).toBe("music");
    expect(url.searchParams.get("entity")).toBe("song");
    expect(url.searchParams.get("term")).toBe("Queen Bohemian Rhapsody");
  });
});

describe("lookupPreview – picking the right track", () => {
  it("skips a result by another artist and takes the matching one", async () => {
    const fetchFn = fakeItunes([
      track("Panic! At the Disco", "Bohemian Rhapsody"),
      track("Queen", "Bohemian Rhapsody"),
    ]);
    const result = await lookupPreview({ artist: "Queen", title: "Bohemian Rhapsody" }, { fetchFn });
    expect(result).toMatchObject({ ok: true, previewUrl: "https://audio.example.com/Queen-Bohemian-Rhapsody.m4a" });
  });

  it("returns not-found when only other artists come back", async () => {
    const fetchFn = fakeItunes([track("Panic! At the Disco", "Bohemian Rhapsody")]);
    const result = await lookupPreview({ artist: "Queen", title: "Bohemian Rhapsody" }, { fetchFn });
    expect(result).toEqual({ ok: false, reason: "not-found", message: PREVIEW_NOT_FOUND_MESSAGE });
  });

  it("matches titles after clean-up (remaster suffix, feat. in brackets, punctuation, case)", async () => {
    const cases = [
      { ours: { artist: "Queen", title: "Bohemian Rhapsody" }, theirs: track("Queen", "Bohemian Rhapsody - Remastered 2011") },
      { ours: { artist: "Mark Ronson", title: "Uptown Funk" }, theirs: track("Mark Ronson", "Uptown Funk (feat. Bruno Mars)") },
      { ours: { artist: "Britney Spears", title: "...Baby One More Time" }, theirs: track("Britney Spears", "...Baby one more time") },
    ];
    for (const { ours, theirs } of cases) {
      const result = await lookupPreview(ours, { fetchFn: fakeItunes([theirs]) });
      expect(result, theirs.trackName).toMatchObject({ ok: true, previewUrl: theirs.previewUrl });
    }
  });

  it("accepts the artist with a featured partner but not a different artist that starts the same", async () => {
    const withPartner = await lookupPreview(
      { artist: "Daft Punk", title: "Get Lucky" },
      { fetchFn: fakeItunes([track("Daft Punk & Pharrell Williams", "Get Lucky")]) },
    );
    expect(withPartner).toMatchObject({ ok: true });

    const tributeBand = await lookupPreview(
      { artist: "Daft Punk", title: "Get Lucky" },
      { fetchFn: fakeItunes([track("Daft Punk Tribute Band", "Get Lucky")]) },
    );
    expect(tributeBand).toMatchObject({ ok: false, reason: "not-found" });
  });

  it("skips karaoke, live and remix versions (track or album name) and takes the studio version", async () => {
    const studio = track("Oasis", "Wonderwall", { collectionName: "(What's the Story) Morning Glory?" });
    const fetchFn = fakeItunes([
      track("Oasis", "Wonderwall (Live)"),
      track("Oasis", "Wonderwall", { collectionName: "Familiar to Millions (Live)" }),
      track("Oasis", "Wonderwall - Remix"),
      track("Oasis", "Wonderwall", { collectionName: "Karaoke Hits Vol. 3" }),
      studio,
    ]);
    const result = await lookupPreview({ artist: "Oasis", title: "Wonderwall" }, { fetchFn });
    expect(result).toMatchObject({ ok: true, previewUrl: studio.previewUrl });
  });

  it("does not skip a song whose own title contains 'live'", async () => {
    const fetchFn = fakeItunes([track("Paul McCartney & Wings", "Live and Let Die")]);
    const result = await lookupPreview({ artist: "Paul McCartney & Wings", title: "Live and Let Die" }, { fetchFn });
    expect(result).toMatchObject({ ok: true });
  });

  it("skips results without a preview, and returns not-found if none has one", async () => {
    const withPreview = track("Toto", "Africa");
    const mixed = await lookupPreview(
      { artist: "Toto", title: "Africa" },
      { fetchFn: fakeItunes([track("Toto", "Africa", { previewUrl: undefined }), withPreview]) },
    );
    expect(mixed).toMatchObject({ ok: true, previewUrl: withPreview.previewUrl });

    const none = await lookupPreview(
      { artist: "Toto", title: "Africa" },
      { fetchFn: fakeItunes([track("Toto", "Africa", { previewUrl: undefined })]) },
    );
    expect(none).toEqual({ ok: false, reason: "not-found", message: PREVIEW_NOT_FOUND_MESSAGE });
  });

  it("returns not-found when iTunes has no results", async () => {
    const result = await lookupPreview({ artist: "Nobody", title: "Nothing" }, { fetchFn: fakeItunes([]) });
    expect(result).toEqual({ ok: false, reason: "not-found", message: PREVIEW_NOT_FOUND_MESSAGE });
  });
});

describe("lookupPreview – iTunes problems never throw", () => {
  const unavailable = { ok: false, reason: "unavailable", message: MUSIC_UNAVAILABLE_MESSAGE };
  const song = { artist: "Queen", title: "Bohemian Rhapsody" };

  it("returns unavailable for error codes 500 and 429 (too many requests)", async () => {
    for (const status of [500, 429]) {
      const fetchFn = vi.fn(async () => new Response("error", { status }));
      expect(await lookupPreview(song, { fetchFn }), String(status)).toEqual(unavailable);
    }
  });

  it("returns unavailable when iTunes does not answer in time", async () => {
    // Never answers – only gives up when the request is aborted.
    const fetchFn = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    expect(await lookupPreview(song, { fetchFn, timeoutMs: 20 })).toEqual(unavailable);
  });

  it("returns unavailable on a network error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await lookupPreview(song, { fetchFn })).toEqual(unavailable);
  });

  it("returns unavailable when the reply is not JSON", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));
    expect(await lookupPreview(song, { fetchFn })).toEqual(unavailable);
  });
});
