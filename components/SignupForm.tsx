"use client";

import { useState } from "react";
import Link from "next/link";
import { apiSignUp } from "@/lib/client/account-api";
import styles from "./Landing.module.css";

// The sign-up form: email, username, password. The server checks every rule; the browser only sends the
// values and shows the reply. After a valid sign-up the form is replaced by "Check your inbox …".
export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const result = await apiSignUp({ email: email.trim(), username: username.trim(), password });
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
      <label htmlFor="signup-email" className={styles.codeLabel}>
        Email
      </label>
      <input
        id="signup-email"
        className={styles.textInput}
        type="email"
        autoComplete="email"
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label htmlFor="signup-username" className={styles.codeLabel}>
        Username
      </label>
      <input
        id="signup-username"
        className={styles.textInput}
        autoComplete="username"
        maxLength={20}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        aria-describedby="signup-username-rule"
        required
      />
      <p id="signup-username-rule" className={styles.hint}>
        3–20 characters: letters, digits and _
      </p>

      <label htmlFor="signup-password" className={styles.codeLabel}>
        Password
      </label>
      <input
        id="signup-password"
        className={styles.textInput}
        type="password"
        autoComplete="new-password"
        maxLength={128}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-describedby="signup-password-rule"
        required
      />
      <p id="signup-password-rule" className={styles.hint}>
        8–128 characters, no spaces
      </p>

      <p className={styles.error} role="alert">
        {error}
      </p>
      <button type="submit" className={styles.primary} disabled={sending}>
        {sending ? "Signing up…" : "Sign up"}
      </button>
      <p className={styles.hint}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
