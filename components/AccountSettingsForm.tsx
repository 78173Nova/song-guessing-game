"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiAccountSettings, apiSaveAccountSettings } from "@/lib/client/account-api";
import { DEFAULT_AVATAR } from "@/lib/game/avatars";
import { NICKNAME_MAX_LENGTH } from "@/lib/game/rooms";
import AvatarPicker from "./AvatarPicker";
import styles from "./Landing.module.css";

// Changes the saved avatar and usual nickname of the logged-in account (issue #44). The nickname screen of every
// room starts with them. The server checks both again (same nickname rules as in rooms) and only ever changes the
// account of this browser's session.
export default function AccountSettingsForm() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR as string);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiAccountSettings().then((account) => {
      if (account === null) {
        router.replace("/login?next=/account");
        return;
      }
      setUsername(account.username);
      setAvatar(account.avatar ?? DEFAULT_AVATAR);
      setNickname(account.nickname ?? "");
    });
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    setSaved("");
    const result = await apiSaveAccountSettings({ avatar, nickname });
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNickname(result.data.nickname ?? "");
    setSaved("Saved.");
  }

  if (username === null) return <p className={styles.hint} aria-busy="true">One moment…</p>;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.hint}>
        Logged in as <strong>{username}</strong>
      </p>
      <AvatarPicker value={avatar} onChange={setAvatar} legend="Your avatar" />
      <label htmlFor="usual-nickname" className={styles.codeLabel}>
        Your usual nickname
      </label>
      <input
        id="usual-nickname"
        className={styles.textInput}
        autoComplete="nickname"
        maxLength={NICKNAME_MAX_LENGTH}
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        aria-describedby="usual-nickname-hint"
      />
      <p id="usual-nickname-hint" className={styles.hint}>
        Filled in when you enter a room; leave it empty to use your username.
      </p>
      <p className={styles.error} role="alert">
        {error}
      </p>
      <p className={styles.hint} role="status">
        {saved}
      </p>
      <button type="submit" className={styles.primary} disabled={sending}>
        {sending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
