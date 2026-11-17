// The "Join a room" list (issue #36) as plain functions: what one listed room shows. No browser, no network.
import { GENRE_LABELS, type Genre } from "../game/genres";
import type { Mode } from "../game/modes";
import type { ListedRoom } from "./room-api";
import { formatCountdown } from "./countdown";

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

// "Starts in 0:42" while the room's lobby countdown runs (issue #37), null otherwise. Counted on the server's clock:
// `offsetMs` = server clock − this device's clock (serverClockOffset of the list's `serverNow`); `localNow` is
// Date.now().
export function listedRoomCountdown(room: ListedRoom, offsetMs: number, localNow: number): string | null {
  const endsAt = room.countdownEndsAt ?? null;
  return endsAt === null ? null : `Starts in ${formatCountdown(Date.parse(endsAt) - (localNow + offsetMs))}`;
}
