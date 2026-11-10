# Name That Tune: prototype

A single-player music quiz in one HTML file. Pick a genre, a decade and a question type. You hear ten 30-second previews and pick the answer from four choices before a 15-second countdown ends.

## Files

| File | What it is |
| --- | --- |
| `name-that-tune.html` | The whole game: markup, styles and script in one file (about 820 lines). |
| `tests/run.js` | An end-to-end test that plays full games in a headless browser, with Apple and MusicBrainz replaced by fake responses. |
| `README.md` | This file. |

## How to run

Download `name-that-tune.html` and open it in Chrome, Safari, Firefox or Edge. There's nothing to install, no build step and no API key.

Don't open it in an in-app file preview, such as the Claude app's preview panel. Those previews block connections to outside websites, so the game can't reach Apple. The game detects this and says so.

## APIs used

### 1. iTunes Search API (Apple)

Finds each seed artist's songs, with preview clips, artwork and store links.

- **Endpoint:** `GET https://itunes.apple.com/search`
- **Key:** none.
- **Parameters sent:**

  | Parameter | Value | Why |
  | --- | --- | --- |
  | `term` | the seed artist, e.g. `Bon Jovi` | what to search for |
  | `media` | `music` | music only |
  | `entity` | `song` | single tracks, not albums |
  | `attribute` | `artistTerm` | match the term against the artist name only |
  | `limit` | `60` | up to 60 results (the API maximum is 200) |
  | `country` | `US` by default; the Store setting on the start screen changes it | which country's store to search |
  | `callback` | only in fallback mode | turns the reply into JSONP |

- **Response fields used:** `kind`, `trackId`, `trackName`, `artistName`, `collectionName`, `releaseDate`, `trackExplicitness`, `previewUrl`, `artworkUrl100`, `trackViewUrl`, `collectionViewUrl`.
- **How the game calls it:** first a plain `fetch`, since Apple allows calls from web pages (CORS). If the browser refuses that, it falls back to JSONP: it adds a `<script>` tag whose URL carries `&callback=<function name>`. Code: `getJson()`, `jsonp()`, `searchArtist()`.
- **Rate limit:** about 20 calls per minute. The game makes at most 18 live calls in any 60 seconds (`itunesSlot()`) and caches each artist's search results in `localStorage` for 24 hours.
- **Terms:** previews and artwork may be used to promote the matching store content. Streaming the previews is allowed; downloading or caching the audio is not. The game streams only, shows "Previews provided courtesy of iTunes", and links every revealed song to Apple Music. Before a public launch, check Apple's terms or use a licensed route (see the prototype plan).
- **Docs:** https://performance-partners.apple.com/search-api

### 2. Apple preview audio and artwork (content delivery servers)

These aren't separate APIs, just the URLs returned by the search.

- **Audio:** `previewUrl` (for example on `audio-ssl.itunes.apple.com`) is played by one `<audio>` element. It's never downloaded or stored.
- **Artwork:** `artworkUrl100` on `is1-ssl.mzstatic.com`. Changing `100x100bb` to `600x600bb` in the URL gives the large version.
- **Store link:** `trackViewUrl` opens the song on Apple Music. It's shown on the reveal panel and the results screen.

### 3. MusicBrainz Web Service v2

Finds a song's original release year for "What year?" questions. Apple's `releaseDate` is often a remaster or compilation date.

- **Endpoint:** `GET https://musicbrainz.org/ws/2/recording`
- **Key:** none.
- **Parameters sent:** `query=recording:"<title>" AND artist:"<artist>"`, `fmt=json`, `limit=25`.
- **Response fields used:** `recordings[].score`, `recordings[].title`, `recordings[]["first-release-date"]`, `recordings[]["artist-credit"][].name`.
- **Logic** (`originalYear()`):
  1. Keep recordings with a score of 85 or more whose title and artist match.
  2. Take the earliest year.
  3. In `buildGame()`, use the lower of that year and Apple's year.
  4. If no year is found, the round becomes an artist question.
- **Rate limit:** about 1 call per second per IP address. The game waits 1.1 seconds between calls and caches years in `localStorage` with no expiry.
- **User-Agent:** MusicBrainz asks apps to identify themselves with a User-Agent header. A browser page can't set one, so the browser's own header is sent. That's fine for a prototype; a public version should make these calls from a server (the Cloudflare Worker in the plan).
- **Data licence:** the core MusicBrainz data is public domain (CC0).
- **Docs:** https://musicbrainz.org/doc/MusicBrainz_API and https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting

### 4. Google Fonts

Loads the Bricolage Grotesque and Inter typefaces from `https://fonts.googleapis.com/css2`. It's for looks only; if it fails, the game falls back to system fonts.

### Browser features used

| Feature | Used for |
| --- | --- |
| `HTMLAudioElement` | Playing previews, fading volume in and out, mute |
| `fetch` + `AbortController` | API calls with a 12-second timeout |
| `<script>` tag (JSONP) | Fallback for Apple search |
| `localStorage` | Settings, cached search results, cached years, the rate-limit call log |
| `requestAnimationFrame` | The countdown ring |
| Clipboard API | "Copy score" |
| `securitypolicyviolation` event | Detecting a preview that blocks outside sites |

## How the code is organised

Everything is in the `<script>` at the end of `name-that-tune.html`, in this order:

| Section | Main pieces | What it does |
| --- | --- | --- |
| Seeds | `SEEDS`, `GENRES`, `DECADES`, `TYPES` | Hand-picked artists for 6 genres × up to 7 decades. The seed list defines the genre, because iTunes can't filter by genre and decade together. |
| Helpers | `key()`, `cleanTitle()`, `titleKey()`, `store` | Name comparison (accents, `&`, punctuation), title clean-up ("(Remastered 2011)" removed), safe `localStorage` access |
| iTunes | `itunesSlot()`, `getJson()`, `jsonp()`, `searchArtist()`, `usableTracks()` | Rate-limited search with retry and caching; filters out wrong artists, tribute and karaoke versions, live versions, remixes and duplicates, and (in clean mode) explicit tracks |
| MusicBrainz | `originalYear()` | Original release year, cached |
| Game builder | `buildGame()`, `yearChoices()`, `cellsFor()`, `available()` | Picks up to 13 candidate songs (at most 2 per artist), preferring songs from the chosen decade, and turns them into 10 questions with 3 wrong answers each |
| Audio | `fadeTo()`, `stopAudio()` | One `<audio>` element. The Start tap unlocks audio on iPhone. |
| Game flow | `startGame()`, `startRound()`, `onPlaying()`, `tick()`, `answer()`, `skipBroken()`, `next()`, `showResults()` | Screens, countdown (starts when the music actually starts), scoring, reveal, results |
| Errors | `networkMessage()` | A specific message for: preview blocked, rate limited, slow, offline, or blocked by a content blocker |
| Wiring | `initSettings()`, button handlers, keyboard | Settings, buttons, keys 1–4 to answer, Enter for the next song |

### Scoring

| Event | Points |
| --- | --- |
| Correct answer | 100 |
| Speed bonus | up to +50, falling linearly over 15 seconds (none with the countdown off) |
| Streak of 3 or more | +25 per round while the streak lasts |
| Wrong, timed out or skipped | 0, and the streak resets |
| Preview failed to load | not counted |

Maximum for 10 rounds: 1,700.

## Running the tests

The test plays complete games with every external service replaced by fake responses, so it needs no internet.

```bash
npm install playwright        # once
npx playwright install chromium
# the test finds name-that-tune.html one folder up; set PAGE=file:///… to override
node tests/run.js
```

It checks:
- a mixed game with one timed-out round, played on a phone-sized screen;
- a year-question game played with the keyboard, plus a replay that uses the cache;
- a title-question game in clean mode, with broken previews;
- the "Apple unreachable" message;
- the "blocked preview" message.

Screenshots go to `tests/shots/`.
