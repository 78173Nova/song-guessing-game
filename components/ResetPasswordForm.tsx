"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiResetPassword } from "@/lib/client/account-api";
import styles from "./Landing.module.css";

type State = { kind: "form" } | { kind: "changed"; message: string } | { kind: "no-token" };

const NO_TOKEN_MESSAGE = "This link is not complete. Please open the link from the email again.";

// Reads the token from the address bar once and removes it from there (so it does not stay in the history or
// get shared by accident), like VerifyEmail. The token is kept in memory and sent together with the new
// password. The server checks the password rule and the link and answers with a clear message.
export default function ResetPasswordForm() {
  const [state, setState] = useState<State>({ kind: "form" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // React runs effects twice in development; the token is read only once, before it is removed.
  const started = useRef(false);
  const token = useRef<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    token.current = new URLSearchParams(window.location.search).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    // Set after the effect, not during it, so the page does not render twice in one go.
    if (!token.current) queueMicrotask(() => setState({ kind: "no-token" }));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.current || sending) return;
    setSending(true);
    setError("");
    const result = await apiResetPassword(token.current, password);
    setSending(false);
    if (result.ok) setState({ kind: "changed", message: result.data.message });
    else setError(result.message);
  }

  if (state.kind === "no-token") {
    return (
      <p className={styles.error} role="alert">
        {NO_TOKEN_MESSAGE}
      </p>
    );
  }

  if (state.kind === "changed") {
    return (
      <>
        <p className={styles.pitch} role="status">
          {state.message}
        </p>
        <Link href="/login" className={styles.primary}>
          Log in
        </Link>
      </>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor="reset-password" className={styles.codeLabel}>
        New password
      </label>
      <input
        id="reset-password"
        className={styles.textInput}
        type="password"
        autoComplete="new-password"
        maxLength={128}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-describedby="reset-password-rule"
        required
      />
      <p id="reset-password-rule" className={styles.hint}>
        8–128 characters. Saving it logs you out everywhere.
      </p>

      <p className={styles.error} role="alert">
        {error}
      </p>
      <button type="submit" className={styles.primary} disabled={sending}>
        {sending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
