// Avoiding the songs of the player's last games (spec 003, decision 013). Plain functions: no database, no network.
import { ROUNDS_PER_GAME } from "./rounds.ts";

// The most recent games the browser may send, newest first.
export const MAX_RECENT_GAMES = 3;

// The song lists to try, in order, for a new game. `recentSongIds` holds the song IDs of each recent game,
// newest game first. First without the songs of all recent games, then without one game fewer (the oldest
// is allowed back first), and so on, the full list last. A step that leaves fewer than ROUNDS_PER_GAME songs
// (or `minSongs`, the length of this game) is skipped. The server uses the first list that can fill a game in the
// chosen mode.
export function songPools<T extends { id: number }>(
  songs: T[],
  recentSongIds: number[][],
  minSongs: number = ROUNDS_PER_GAME,
): T[][] {
  const pools: T[][] = [];
  for (let games = recentSongIds.length; games > 0; games--) {
    const avoid = new Set(recentSongIds.slice(0, games).flat());
    const pool = songs.filter((song) => !avoid.has(song.id));
    if (pool.length >= minSongs && pool.length < songs.length) pools.push(pool);
  }
  pools.push(songs);
  return pools;
}
