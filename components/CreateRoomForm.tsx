"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiWhoIsLoggedIn } from "@/lib/client/account-api";
import { apiCreateRoom, saveRoomToken } from "@/lib/client/room-api";
import { markShareOnArrival } from "@/lib/client/share";
import { NICKNAME_MAX_LENGTH } from "@/lib/game/rooms";
import styles from "./Landing.module.css";

// "Create a room": an account holder picks a nickname and becomes the room creator, a player like everyone else.
// A guest is sent to log in and comes back here afterwards. The server checks the login again when creating.
export default function CreateRoomForm() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiWhoIsLoggedIn().then((username) => {
      if (username === null) router.replace("/login?next=/create");
      else setLoggedIn(true);
    });
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const result = await apiCreateRoom(nickname);
    if (result.ok) {
      saveRoomToken(result.data.code, result.data.playerToken);
      markShareOnArrival(result.data.code); // the lobby opens the share pop-up once
      router.push(`/join/${result.data.code}`);
      return;
    }
    setSending(false);
    setError(result.message);
  }

  if (loggedIn !== true) return <p className={styles.hint} aria-busy="true">One moment…</p>;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.hint}>
        For now every room plays one set of 5 songs from any genre and decade: guess the title.
      </p>
      <label htmlFor="create-nickname" className={styles.codeLabel}>
        Your nickname in this room
      </label>
      <input
        id="create-nickname"
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
        {sending ? "Creating…" : "Create the room"}
      </button>
    </form>
  );
}
