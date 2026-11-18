"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { serverClockOffset } from "@/lib/client/countdown";
import { apiListRooms, type ListedRoom, type RoomListFilter } from "@/lib/client/room-api";
import { describeListedRoom, listedRoomCountdown, MODE_LABELS, ROOM_LIST_REFRESH_MS } from "@/lib/client/room-list";
import { isTileSelected, toggleTile } from "@/lib/client/room-settings";
import { DECADES, type Decade } from "@/lib/game/filters";
import { GENRE_LABELS, GENRES, type Genre } from "@/lib/game/genres";
import { MODES, type Mode } from "@/lib/game/modes";
import TileGroup from "./TileGroup";
import styles from "./Landing.module.css";

const ANY_FILTER: RoomListFilter = { type: "multiplayer", mode: "any", genres: "any", decades: "any" };

// The "Join a room" list (issue #36): the public rooms in the lobby that are not full, narrowed by the Duel/Multiplayer
// toggle and the mode, genre and decade filters. The server decides which rooms are listed; this page asks again
// every 5 s, so rooms that start, fill up or close disappear by themselves. Tapping a room opens its nickname screen.
export default function RoomList() {
  const [filter, setFilter] = useState<RoomListFilter>(ANY_FILTER);
  const [rooms, setRooms] = useState<ListedRoom[] | null>(null);
  const [error, setError] = useState("");
  // This device's clock for the countdowns in the list (issue #37). Set when a list arrives, never while the page
  // is rendered on the server. The countdowns run on the server's clock: `offset` is how far it is ahead.
  const [now, setNow] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let current = true;
    const load = async () => {
      const result = await apiListRooms(filter);
      if (!current) return; // a late reply for older filters
      if (result.ok) {
        const receivedAt = Date.now();
        setRooms(result.rooms);
        setOffset(serverClockOffset(result.serverNow, receivedAt));
        setNow(receivedAt);
        setError("");
      } else {
        setError(result.message); // the last list stays until the next try works
      }
    };
    load();
    const timer = setInterval(load, ROOM_LIST_REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [filter]);

  // The countdowns in the list tick every second between two list requests.
  const counting = rooms?.some((room) => (room.countdownEndsAt ?? null) !== null) ?? false;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const change = (part: Partial<RoomListFilter>) => setFilter((old) => ({ ...old, ...part }));
  const { genres, decades } = filter;

  return (
    <section className={styles.form} aria-labelledby="room-list-title">
      <h2 id="room-list-title" className={styles.codeLabel}>
        Public rooms
      </h2>
      <TileGroup
        legend="Room type"
        options={[
          { value: "duel", label: "Duel" },
          { value: "multiplayer", label: "Multiplayer" },
        ]}
        selected={(value) => filter.type === value}
        onTap={(value) => change({ type: value as RoomListFilter["type"] })}
      />
      <TileGroup
        legend="Mode"
        options={[{ value: "any", label: "Any" }, ...MODES.map((mode) => ({ value: mode, label: MODE_LABELS[mode] }))]}
        selected={(value) => filter.mode === value}
        onTap={(value) => change({ mode: value as "any" | Mode })}
      />
      <TileGroup
        legend="Genres"
        options={[{ value: "any", label: "Any" }, ...GENRES.map((genre) => ({ value: genre, label: GENRE_LABELS[genre] }))]}
        selected={(value) => isTileSelected<Genre>(genres, value as Genre)}
        onTap={(value) => change({ genres: toggleTile<Genre>(genres, value as Genre) })}
      />
      <TileGroup
        legend="Decades"
        options={[{ value: "any", label: "Any" }, ...DECADES.map((decade) => ({ value: String(decade), label: `${decade}s` }))]}
        selected={(value) => isTileSelected<Decade>(decades, value === "any" ? "any" : (Number(value) as Decade))}
        onTap={(value) => change({ decades: toggleTile<Decade>(decades, value === "any" ? "any" : (Number(value) as Decade)) })}
      />

      <p className={styles.error} role="alert">
        {error}
      </p>
      {rooms === null ? (
        <p className={styles.hint} aria-busy="true">
          Looking for rooms…
        </p>
      ) : rooms.length === 0 ? (
        <p className={styles.hint}>No open rooms fit these filters right now. The list updates by itself.</p>
      ) : (
        <ul className={styles.roomList} aria-live="polite">
          {rooms.map((room) => {
            const text = describeListedRoom(room);
            const countdown = listedRoomCountdown(room, offset, now);
            return (
              <li key={room.code}>
                <Link href={`/join/${room.code}`} className={styles.roomEntry}>
                  <span className={styles.roomEntryTop}>
                    <strong>{text.creator}</strong>
                    <span>{text.players}</span>
                  </span>
                  <span className={styles.roomEntryDetails}>
                    {text.mode} · {text.genres} · {text.decades} · {text.songs}
                  </span>
                  {countdown !== null && <span className={styles.roomEntryDetails}>{countdown}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
