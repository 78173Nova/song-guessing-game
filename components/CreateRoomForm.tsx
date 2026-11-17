"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiAccountSettings } from "@/lib/client/account-api";
import { nicknameScreenStart } from "@/lib/client/nickname-screen";
import { apiCreateRoom, saveRoomToken } from "@/lib/client/room-api";
import { markShareOnArrival } from "@/lib/client/share";
import { avatarEmoji } from "@/lib/game/avatars";
import { NICKNAME_MAX_LENGTH } from "@/lib/game/rooms";
import AvatarPicker from "./AvatarPicker";
import styles from "./Landing.module.css";

// "Create a room": an account holder picks a nickname and becomes the room creator, a player like everyone else.
// A guest is sent to log in and comes back here afterwards. The server checks the login again when creating.
// The usual nickname (else the username) and the saved avatar are filled in (issue #44); an account without an
// avatar picks one here once, and the server saves it.
export default function CreateRoomForm() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("");
  const [askAvatar, setAskAvatar] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiAccountSettings().then((account) => {
      if (account === null) {
        router.replace("/login?next=/create");
        return;
      }
      const start = nicknameScreenStart(account);
      setNickname(start.nickname);
      setAvatar(start.avatar);
      setAskAvatar(start.askAvatar);
      setLoggedIn(true);
    });
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const result = await apiCreateRoom({ nickname, avatar });
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
      {askAvatar ? (
        <AvatarPicker value={avatar} onChange={setAvatar} legend="Choose your avatar (we keep it for next time)" />
      ) : (
        <p className={styles.hint}>
          Your avatar: <span aria-hidden="true">{avatarEmoji(avatar)}</span>{" "}
          <button type="button" className={styles.linkButton} onClick={() => setAskAvatar(true)}>
            Change for this room
          </button>
        </p>
      )}
      <p className={styles.error} role="alert">
        {error}
      </p>
      <button type="submit" className={styles.primary} disabled={sending}>
        {sending ? "Creating…" : "Create the room"}
      </button>
    </form>
  );
}
