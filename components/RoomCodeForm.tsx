"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseRoomCode, ROOM_CODE_RULE } from "@/lib/client/room-code";
import styles from "./Landing.module.css";

// The room code box on the landing page: checks the format, then opens /join/<code>.
export default function RoomCodeForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function enter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = parseRoomCode(input);
    if (code === null) {
      setError(ROOM_CODE_RULE);
      return;
    }
    setError("");
    router.push(`/join/${code}`);
  }

  return (
    <form className={styles.codeForm} onSubmit={enter} noValidate>
      <label htmlFor="room-code" className={styles.codeLabel}>
        Got a room code?
      </label>
      <div className={styles.codeRow}>
        <input
          id="room-code"
          className={styles.codeInput}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="482913"
          aria-invalid={error !== ""}
          aria-describedby="room-code-error"
        />
        <button type="submit" className={styles.primary}>
          Enter
        </button>
      </div>
      <p id="room-code-error" className={styles.error} role="alert">
        {error}
      </p>
    </form>
  );
}
