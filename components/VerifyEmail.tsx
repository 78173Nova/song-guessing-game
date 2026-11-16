"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiVerifyEmail } from "@/lib/client/account-api";
import styles from "./Landing.module.css";

type State = { kind: "checking" } | { kind: "verified"; message: string } | { kind: "failed"; message: string };

const NO_TOKEN_MESSAGE = "This link is not complete. Please open the link from the email again.";

// Reads the token from the address bar once, removes it from there (so it does not stay in the history or get
// shared by accident), sends it to the server and shows the reply.
export default function VerifyEmail() {
  const [state, setState] = useState<State>({ kind: "checking" });
  // React runs effects twice in development; the link works only once, so it must be sent only once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get("token");
    window.history.replaceState(null, "", window.location.pathname);

    if (!token) {
      // Set after the effect, not during it, so the page does not render twice in one go.
      queueMicrotask(() => setState({ kind: "failed", message: NO_TOKEN_MESSAGE }));
      return;
    }
    apiVerifyEmail(token).then((result) =>
      setState(result.ok ? { kind: "verified", message: result.data.message } : { kind: "failed", message: result.message }),
    );
  }, []);

  if (state.kind === "checking") {
    return (
      <p className={styles.pitch} role="status">
        Checking your link…
      </p>
    );
  }

  if (state.kind === "verified") {
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
    <p className={styles.error} role="alert">
      {state.message}
    </p>
  );
}
