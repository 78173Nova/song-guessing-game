"use client";

import { useState } from "react";
import Link from "next/link";
import { apiForgotPassword } from "@/lib/client/account-api";
import styles from "./Landing.module.css";

// The forgot-password form: one email box. The server always gives the same answer for a known and an unknown
// email, so after sending the form is replaced by "If an account exists for that address, we sent an email".
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const result = await apiForgotPassword(email.trim());
    setSending(false);
    if (result.ok) setDone(result.data.message);
    else setError(result.message);
  }

  if (done) {
    return (
      <p className={styles.pitch} role="status">
        {done}
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor="forgot-email" className={styles.codeLabel}>
        Email
      </label>
      <input
        id="forgot-email"
        className={styles.textInput}
        type="email"
        autoComplete="email"
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <p className={styles.error} role="alert">
        {error}
      </p>
      <button type="submit" className={styles.primary} disabled={sending}>
        {sending ? "Sending…" : "Send me a link"}
      </button>
      <p className={styles.hint}>
        Remembered it? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
