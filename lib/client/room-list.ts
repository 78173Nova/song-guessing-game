// The "Join a room" list (issue #36) as plain functions: what one listed room shows. No browser, no network.
import { GENRE_LABELS, type Genre } from "../game/genres";
import type { Mode } from "../game/modes";
import type { ListedRoom } from "./room-api";

export const MODE_LABELS: Record<Mode, string> = { title: "Title", artist: "Artist", year: "Year", mixed: "Mixed" };

// How often the list asks the server again, in milliseconds.
export const ROOM_LIST_REFRESH_MS = 5000;

// The texts of one entry: "Anna", "Artist", "Pop, Rock", "1980s", "5 songs × 2 sets", "7 / 25".
export function describeListedRoom(room: ListedRoom) {
  return {
    creator: room.creator,
    mode: MODE_LABELS[room.mode],
    genres: room.genres === "any" ? "Any genre" : room.genres.map((genre: Genre) => GENRE_LABELS[genre]).join(", "),
    decades: room.decades === "any" ? "Any decade" : room.decades.map((decade) => `${decade}s`).join(", "),
    songs: `${room.songsPerSet} songs × ${room.sets} ${room.sets === 1 ? "set" : "sets"}`,
    players: `${room.players} / ${room.maxPlayers}`,
  };
}
