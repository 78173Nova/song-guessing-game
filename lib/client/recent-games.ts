// The player's last games, newest first, kept in the browser's memory only (no localStorage): they are sent
// with the next start, so the server can avoid their songs (spec 003, decision 013). A reload forgets them.
import { MAX_RECENT_GAMES } from "../game/recent-songs";

// The list with `gameId` added in front, without a duplicate, at most MAX_RECENT_GAMES long. Returns a new list.
export function rememberGame(recent: string[], gameId: string): string[] {
  return [gameId, ...recent.filter((id) => id !== gameId)].slice(0, MAX_RECENT_GAMES);
}
