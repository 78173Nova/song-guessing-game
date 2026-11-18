"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiAccountSettings } from "@/lib/client/account-api";
import { nicknameScreenStart } from "@/lib/client/nickname-screen";
import { apiCreateRoom, apiMatchingSongs, saveRoomToken } from "@/lib/client/room-api";
import { isTileSelected, toggleTile, type TileChoice } from "@/lib/client/room-settings";
import { DECADES, type Decade } from "@/lib/game/filters";
import { GENRE_LABELS, GENRES, type Genre } from "@/lib/game/genres";
import { MODES, type Mode } from "@/lib/game/modes";
import { MODE_LABELS } from "@/lib/client/room-list";
import {
  DEFAULT_ROOM_SETTINGS,
  SET_CHOICES,
  SONGS_PER_SET_CHOICES,
  tooFewRoomSongsMessage,
  totalRoundsOf,
  type RoomSettings,
} from "@/lib/game/room-settings";
import { markShareOnArrival } from "@/lib/client/share";
import { avatarEmoji } from "@/lib/game/avatars";
import { NICKNAME_MAX_LENGTH } from "@/lib/game/rooms";
import AvatarPicker from "./AvatarPicker";
import styles from "./Landing.module.css";


// "Create a room": an account holder picks a nickname and the room settings (issue #34) and becomes the room
// creator, a player like everyone else. The settings cannot be changed afterwards. A guest is sent to log in and
// comes back here afterwards. The server checks the login and every setting again when creating.
// The usual nickname (else the username) and the saved avatar are filled in (issue #44); an account without an
// avatar picks one here once, and the server saves it.
export default function CreateRoomForm() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("");
  const [askAvatar, setAskAvatar] = useState(false);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [isPrivate, setIsPrivate] = useState(false);
  const [matching, setMatching] = useState<number | null>(null);
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

  // How many songs match the chosen genres and decades, asked again on every change. A late reply for an older
  // choice is ignored.
  const { genres, decades } = settings;
  useEffect(() => {
    let current = true;
    apiMatchingSongs({ genres, decades }).then((count) => {
      if (current) setMatching(count);
    });
    return () => {
      current = false;
    };
  }, [genres, decades]);

  // Next.js keeps this page alive (hidden) after "Create the room" navigates to the lobby, so coming back to
  // /create would show the old "Creating…" button, disabled until a page refresh. Reset the button and any old
  // error when the page is hidden. See node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md.
  useLayoutEffect(() => {
    return () => {
      setSending(false);
      setError("");
    };
  }, []);

  const change = (part: Partial<RoomSettings>) => setSettings((old) => ({ ...old, ...part }));
  const needed = totalRoundsOf(settings);
  const tooFew = matching !== null && matching < needed;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const result = await apiCreateRoom({ nickname, avatar }, settings, fetch, isPrivate);
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

      <p className={styles.hint}>These settings cannot be changed once the room is created.</p>

      <Choice
        legend="Room type"
        options={[
          { value: "duel", label: "Duel (2 players)" },
          { value: "multiplayer", label: "Multiplayer (2–25)" },
        ]}
        selected={(value) => settings.type === value}
        onTap={(value) => change({ type: value as RoomSettings["type"] })}
      />
      <Choice
        legend="Who can find the room?"
        options={[
          { value: "public", label: "Public (in the room list)" },
          { value: "private", label: "Private (code or link only)" },
        ]}
        selected={(value) => (value === "private") === isPrivate}
        onTap={(value) => setIsPrivate(value === "private")}
      />
      <Choice
        legend="What do you guess?"
        options={MODES.map((mode) => ({ value: mode, label: MODE_LABELS[mode] }))}
        selected={(value) => settings.mode === value}
        onTap={(value) => change({ mode: value as Mode })}
      />
      <Choice
        legend="Genres"
        options={[{ value: "any", label: "Any" }, ...GENRES.map((genre) => ({ value: genre, label: GENRE_LABELS[genre] }))]}
        selected={(value) => isTileSelected<Genre>(genres, value as Genre)}
        onTap={(value) => change({ genres: toggleTile<Genre>(genres, value as Genre) as TileChoice<Genre> })}
      />
      <Choice
        legend="Decades"
        options={[{ value: "any", label: "Any" }, ...DECADES.map((decade) => ({ value: String(decade), label: `${decade}s` }))]}
        selected={(value) => isTileSelected<Decade>(decades, value === "any" ? "any" : (Number(value) as Decade))}
        onTap={(value) => change({ decades: toggleTile<Decade>(decades, value === "any" ? "any" : (Number(value) as Decade)) })}
      />
      <Choice
        legend="Songs per set"
        options={SONGS_PER_SET_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
        selected={(value) => String(settings.songsPerSet) === value}
        onTap={(value) => change({ songsPerSet: Number(value) as RoomSettings["songsPerSet"] })}
      />
      <Choice
        legend="Number of sets"
        options={SET_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
        selected={(value) => String(settings.sets) === value}
        onTap={(value) => change({ sets: Number(value) as RoomSettings["sets"] })}
      />

      <p className={tooFew ? styles.error : styles.hint} role="status">
        {matching === null
          ? `${needed} songs needed.`
          : tooFew
            ? tooFewRoomSongsMessage(matching)
            : `${matching} songs match – ${needed} will be played.`}
      </p>
      <p className={styles.error} role="alert">
        {error}
      </p>
      <button type="submit" className={styles.primary} disabled={sending || tooFew}>
        {sending ? "Creating…" : "Create the room"}
      </button>
    </form>
  );
}

// A row of tiles: tapping one calls onTap; `selected` says which are on.
export function Choice({
  legend,
  options,
  selected,
  onTap,
}: {
  legend: string;
  options: { value: string; label: string }[];
  selected: (value: string) => boolean;
  onTap: (value: string) => void;
}) {
  return (
    <fieldset className={styles.tiles}>
      <legend className={styles.codeLabel}>{legend}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={selected(option.value) ? `${styles.tile} ${styles.tileOn}` : styles.tile}
          aria-pressed={selected(option.value)}
          onClick={() => onTap(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
