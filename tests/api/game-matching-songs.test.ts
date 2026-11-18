import { beforeEach, describe, expect, it } from "vitest";
import { getMatchingSongs, startGame } from "@/lib/api/games";
import type { Db } from "@/lib/db/client";
import { listSongs, savePreview, setCatalogue, upsertSongs, type SongInput } from "@/lib/db/songs";
import { createTestDb } from "../helpers/test-db";

// GET /api/games/matching-songs?genre=…&decade=… – for the chosen genre + decade, only three numbers: playable
// songs, different titles, different artists (issue #7). The solo start screen uses them for the line
// "12 songs match – 5 will be played" and to grey out modes that cannot start. Against PGlite, no network.
let db: Db;

const SONGS: SongInput[] = [
  // rock, 1980s: 6 playable songs, all different
  ...[1980, 1981, 1983, 1985, 1987, 1989].map((year, i) => ({ title: `Rock Song ${i + 1}`, artist: `Rock Artist ${i + 1}`, year, genre: "rock" })),
  { title: "Rock NoClip", artist: "Rock NoClip Artist", year: 1984, genre: "rock" }, // no clip: not playable
  { title: "Retired Rock", artist: "Retired Artist", year: 1982, genre: "rock" }, // clip, but not in the catalogue
  // pop, 1990s: 5 songs, 5 titles, but only 2 artists (upper/lower case differs)
  { title: "Pop A", artist: "Queen", year: 1990, genre: "pop" },
  { title: "Pop B", artist: "queen", year: 1992, genre: "pop" },
  { title: "Pop C", artist: "QUEEN", year: 1994, genre: "pop" },
  { title: "Pop D", artist: "ABBA", year: 1996, genre: "pop" },
  { title: "Pop E", artist: "Abba", year: 1998, genre: "pop" },
  // dance, 1970s: 5 songs, 5 artists, but only 3 titles
  { title: "Happy", artist: "Dance Artist 1", year: 1970, genre: "dance" },
  { title: "happy", artist: "Dance Artist 2", year: 1972, genre: "dance" },
  { title: "Hello", artist: "Dance Artist 3", year: 1974, genre: "dance" },
  { title: "HELLO", artist: "Dance Artist 4", year: 1976, genre: "dance" },
  { title: "Home", artist: "Dance Artist 5", year: 1978, genre: "dance" },
];

beforeEach(async () => {
  db = await createTestDb();
  await upsertSongs(db, SONGS);
  for (const song of await listSongs(db)) {
    if (song.title.includes("NoClip")) continue;
    await savePreview(
      db,
      song.id,
      { previewUrl: `https://audio.example.com/${song.id}.m4a`, artworkUrl: "", storeUrl: "" },
      new Date("2026-11-18T10:00:00Z"),
    );
  }
  await setCatalogue(db, SONGS.filter((s) => !s.title.startsWith("Retired")));
});

const ask = (query: string) => getMatchingSongs(db, new URLSearchParams(query));

describe("GET /api/games/matching-songs – accepted", () => {
  it("one genre + one decade: counts only playable songs (with a clip, still in the catalogue)", async () => {
    expect(await ask("genre=rock&decade=1980")).toEqual({ status: 200, body: { songs: 6, titles: 6, artists: 6 } });
  });

  it("counts titles and artists ignoring upper/lower case, like the answer options do", async () => {
    expect(await ask("genre=pop&decade=1990")).toEqual({ status: 200, body: { songs: 5, titles: 5, artists: 2 } });
    expect(await ask("genre=dance&decade=1970")).toEqual({ status: 200, body: { songs: 5, titles: 3, artists: 5 } });
  });

  it("no genre and no decade (Any + Any): every playable song", async () => {
    expect(await ask("")).toEqual({ status: 200, body: { songs: 16, titles: 14, artists: 13 } });
  });

  it("only a genre or only a decade: the other one is Any", async () => {
    expect(await ask("genre=rock")).toEqual({ status: 200, body: { songs: 6, titles: 6, artists: 6 } });
    expect(await ask("decade=1990")).toEqual({ status: 200, body: { songs: 5, titles: 5, artists: 2 } });
  });

  it("a combination without songs gives three zeros, not an error", async () => {
    expect(await ask("genre=hip-hop&decade=1960")).toEqual({ status: 200, body: { songs: 0, titles: 0, artists: 0 } });
  });

  it("sends only the three numbers – no titles, artists, years or song IDs", async () => {
    const result = await ask("genre=rock&decade=1980");
    expect(Object.keys(result.body).sort()).toEqual(["artists", "songs", "titles"]);
    const text = JSON.stringify(result.body);
    expect(text).not.toContain("Rock");
    expect(text).not.toContain("1987");
  });
});

describe("GET /api/games/matching-songs – rejected", () => {
  it("a genre that is not on the list", async () => {
    for (const query of ["genre=jazz", "genre=", "genre=Rock", `genre=${"x".repeat(1000)}`]) {
      const result = await ask(query);
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ error: "invalid-genre" });
    }
  });

  it("a decade that is not one of 1960 … 2020", async () => {
    for (const query of ["decade=1985", "decade=1950", "decade=abc", "decade="]) {
      const result = await ask(query);
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ error: "invalid-decade" });
    }
  });

  it("a filter given twice, or any other field", async () => {
    for (const query of ["genre=rock&genre=pop", "decade=1980&decade=1990", "mode=artist", "genres=rock"]) {
      const result = await ask(query);
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ error: "malformed" });
    }
  });
});

describe("POST /api/games still decides – the numbers only help the screen", () => {
  const start = (body: object) => startGame(db, Math.random, JSON.stringify(body));
  const gamesStored = async () => (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM games"))[0].n;

  it("refuses artist and mixed mode when only 2 different artists match, and stores no game", async () => {
    for (const mode of ["artist", "mixed"]) {
      const result = await start({ mode, genre: "pop", decade: 1990 });
      expect(result.status).toBe(422);
      expect(result.body).toMatchObject({ error: "too-few-songs" });
    }
    expect(await gamesStored()).toBe(0);
  });

  it("refuses title and mixed mode when only 3 different titles match", async () => {
    for (const mode of ["title", "mixed"]) {
      const result = await start({ mode, genre: "dance", decade: 1970 });
      expect(result.status).toBe(422);
      expect(result.body).toMatchObject({ error: "too-few-songs" });
    }
  });

  it("starts the modes the numbers allow", async () => {
    expect((await start({ mode: "title", genre: "pop", decade: 1990 })).status).toBe(201);
    expect((await start({ mode: "year", genre: "pop", decade: 1990 })).status).toBe(201);
    expect((await start({ mode: "artist", genre: "dance", decade: 1970 })).status).toBe(201);
    expect((await start({ mode: "year", genre: "dance", decade: 1970 })).status).toBe(201);
  });
});
