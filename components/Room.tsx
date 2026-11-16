"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MIN_PLAYERS_TO_START, NICKNAME_MAX_LENGTH } from "@/lib/game/rooms";
import {
  apiJoinRoom,
  apiRoomState,
  apiStartRoom,
  forgetRoomToken,
  loadRoomToken,
  saveRoomToken,
  type RoomState,
} from "@/lib/client/room-api";
import styles from "./Landing.module.css";

// How often the lobby asks the server for news (polling, decision 008).
const POLL_MS = 1500;

// What the page shows.
type Screen =
  | { kind: "loading" }
  | { kind: "gone"; message: string } // no such room, or it has closed
  | { kind: "join" } // this tab has no seat yet: choose a nickname
  | { kind: "lobby"; state: RoomState }
  | { kind: "started"; state: RoomState };

// One room at /join/<code>: the nickname form, then the lobby, which updates by itself. Only the room creator
// sees "Start now". The rounds themselves come in the next ticket (#33).
export default function Room({ code }: { code: string }) {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [token, setToken] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState(""); // e.g. "can't reach the server" while polling

  // Numbers each state request. Requests can overlap on a slow connection; only the newest answer counts, so
  // an old "lobby" answer arriving late cannot put a started room back into the lobby.
  const latestRequest = useRef(0);

  // Asks the server for the room and turns the answer into a screen.
  const refresh = useCallback(
    async (currentToken: string | null) => {
      const request = ++latestRequest.current;
      const result = await apiRoomState(code, currentToken);
      if (request !== latestRequest.current) return; // a newer request was sent meanwhile
      if (result.ok) {
        setNote("");
        const { state } = result;
        // A started game never goes back to the lobby.
        setScreen((previous) =>
          state.status === "lobby" && previous.kind !== "started" ? { kind: "lobby", state } : { kind: "started", state },
        );
        return;
      }
      if (result.reason === "gone") setScreen({ kind: "gone", message: result.message });
      else if (result.reason === "not-in") {
        // No seat in this room (or the room does not know this token): offer to join.
        if (currentToken !== null) forgetRoomToken(code);
        setToken(null);
        setScreen({ kind: "join" });
      } else setNote(result.message); // keep showing the last state and try again on the next poll
    },
    [code],
  );

  // First look: with the token this tab saved (after creating or joining), or without one.
  useEffect(() => {
    const saved = loadRoomToken(code);
    queueMicrotask(() => {
      setToken(saved);
      refresh(saved);
    });
  }, [code, refresh]);

  // While in the lobby, ask again every 1.5 seconds.
  const inLobby = screen.kind === "lobby";
  useEffect(() => {
    if (!inLobby || token === null) return;
    const timer = setInterval(() => refresh(token), POLL_MS);
    return () => clearInterval(timer);
  }, [inLobby, token, refresh]);

  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const result = await apiJoinRoom(code, nickname);
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    saveRoomToken(code, result.data.playerToken);
    setToken(result.data.playerToken);
    await refresh(result.data.playerToken);
  }

  async function startNow() {
    if (token === null) return;
    setSending(true);
    setError("");
    const result = await apiStartRoom(code, token);
    setSending(false);
    if (!result.ok) setError(result.message);
    await refresh(token);
  }

  if (screen.kind === "loading") {
    return <p className={styles.pitch} aria-busy="true">Opening room {code}…</p>;
  }

  if (screen.kind === "gone") {
    return (
      <>
        <p className={styles.pitch}>{screen.message}</p>
        <Link href="/" className={styles.textLink}>
          ← Back to the front page
        </Link>
      </>
    );
  }

  if (screen.kind === "join") {
    return (
      <form className={styles.form} onSubmit={join} noValidate>
        <p className={styles.roomCode}>{code}</p>
        <label htmlFor="join-nickname" className={styles.codeLabel}>
          Choose a nickname
        </label>
        <input
          id="join-nickname"
          className={styles.textInput}
          autoComplete="nickname"
          maxLength={NICKNAME_MAX_LENGTH}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          required
        />
        <p className={styles.error} role="alert">
          {error}
        </p>
        <button type="submit" className={styles.primary} disabled={sending}>
          {sending ? "Joining…" : "Join"}
        </button>
      </form>
    );
  }

  const { state } = screen;
  const isCreator = state.role === "creator";
  const enoughPlayers = state.players.length >= MIN_PLAYERS_TO_START;

  return (
    <>
      <p className={styles.roomCode} aria-label={`Room code ${state.code}`}>
        {state.code}
      </p>

      {screen.kind === "started" ? (
        <p className={styles.pitch}>The game has started! The rounds are coming soon.</p>
      ) : (
        <p className={styles.pitch}>
          {isCreator ? "Share the code or the link of this page. Start when everyone is in." : "Waiting for the room creator to start…"}
        </p>
      )}

      <h2 className={styles.codeLabel}>Players ({state.players.length})</h2>
      <ul className={styles.playerList} aria-live="polite">
        {state.players.map((player) => (
          <li key={player} className={player === state.me.nickname ? styles.self : undefined}>
            {player}
            {player === state.me.nickname ? " (you)" : ""}
          </li>
        ))}
      </ul>

      {isCreator && screen.kind === "lobby" && (
        <>
          <button type="button" className={styles.primary} onClick={startNow} disabled={sending || !enoughPlayers}>
            {sending ? "Starting…" : "Start now"}
          </button>
          {!enoughPlayers && <p className={styles.hint}>At least {MIN_PLAYERS_TO_START} players are needed to start.</p>}
        </>
      )}
      <p className={styles.error} role="alert">
        {error || note}
      </p>
    </>
  );
}
