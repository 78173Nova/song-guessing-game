"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiLogIn, apiResendVerification } from "@/lib/client/account-api";
import { rememberNextPath, takeNextPath } from "@/lib/client/next-path";
import styles from "./Landing.module.css";

// The login form: username or email, and password. The server checks everything and sets the session cookie;
// on success the browser goes to the ?next= page, or back to the front page, which then shows "Logged in as …".
export default function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // After "Verify your email first": the address for "Send the email again" and the server's answer.
  const [notVerified, setNotVerified] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendNote, setResendNote] = useState("");
  const [resending, setResending] = useState(false);

  // Remember ?next= in case the person signs up first: the address loses it on the way through the email.
  useEffect(() => {
    rememberNextPath(new URLSearchParams(window.location.search).get("next"));
  }, []);

  // Next.js keeps this page alive (hidden) after a successful login, so "Log out" and then "Log in" would bring
  // back the old "Logging in…" button, disabled until a page refresh (same as CreateRoomForm, PR #70). Reset the
  // button, any old error and the password when the page is hidden; the username stays for the next login.
  // See node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md.
  useLayoutEffect(() => {
    return () => {
      setSending(false);
      setError("");
      setPassword("");
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    setResendNote("");
    const result = await apiLogIn({ login: login.trim(), password });
    if (result.ok) {
      // Back to where the person came from (e.g. /login?next=/create from "Create a room", also after signing
      // up first), but only to a page on this site.
      router.push(takeNextPath(new URLSearchParams(window.location.search).get("next")));
      return;
    }
    setSending(false);
    setError(result.message);
    setNotVerified(result.notVerified);
    // Logged in with an email: use it. With a username the page does not know the email, so it asks for it.
    if (result.notVerified && login.includes("@")) setResendEmail(login.trim());
  }

  async function resend() {
    setResending(true);
    setResendNote("");
    const result = await apiResendVerification(resendEmail.trim());
    setResending(false);
    setResendNote(result.ok ? result.data.message : result.message);
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
      {notVerified && (
        <>
          <label htmlFor="resend-email" className={styles.codeLabel}>
            Email for the new link
          </label>
          <input
            id="resend-email"
            className={styles.textInput}
            type="email"
            autoComplete="email"
            maxLength={254}
            value={resendEmail}
            onChange={(event) => setResendEmail(event.target.value)}
          />
          <button type="button" className={styles.secondary} onClick={resend} disabled={resending}>
            {resending ? "Sending…" : "Send the email again"}
          </button>
          <p className={styles.hint} role="status">
            {resendNote}
          </p>
        </>
      )}
      <button type="submit" className={styles.primary} disabled={sending}>
        {sending ? "Logging in…" : "Log in"}
      </button>
      <p className={styles.hint}>
        No account yet? <Link href="/signup">Sign up</Link>
      </p>
    </form>
  );
}
