"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiLogIn } from "@/lib/client/account-api";
import styles from "./Landing.module.css";

// The login form: username or email, and password. The server checks everything and sets the session cookie;
// on success the browser goes back to the front page, which then shows "Logged in as …".
export default function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const result = await apiLogIn({ login: login.trim(), password });
    if (result.ok) {
      router.push("/");
      return;
    }
    setSending(false);
    setError(result.message);
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor="login-name" className={styles.codeLabel}>
        Username or email
      </label>
      <input
        id="login-name"
        className={styles.textInput}
        autoComplete="username"
        maxLength={254}
        value={login}
        onChange={(event) => setLogin(event.target.value)}
        required
      />

      <label htmlFor="login-password" className={styles.codeLabel}>
        Password
      </label>
      <input
        id="login-password"
        className={styles.textInput}
        type="password"
        autoComplete="current-password"
        maxLength={128}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <p className={styles.hint}>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>

      <p className={styles.error} role="alert">
        {error}
      </p>
      <button type="submit" className={styles.primary} disabled={sending}>
        {sending ? "Logging in…" : "Log in"}
      </button>
      <p className={styles.hint}>
        No account yet? <Link href="/signup">Sign up</Link>
      </p>
    </form>
  );
}
