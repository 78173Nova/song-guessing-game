"use client";

import { useState } from "react";
import Link from "next/link";
import { apiVerifyEmail } from "@/lib/client/account-api";
import { useLinkToken } from "@/lib/client/useLinkToken";
import styles from "./Landing.module.css";

type State = { kind: "checking" } | { kind: "verified"; message: string } | { kind: "failed"; message: string };

const NO_TOKEN_MESSAGE = "This link is not complete. Please open the link from the email again.";

// Reads the token from the address bar once (useLinkToken removes it from there), sends it to the server and
// shows the reply.
export default function VerifyEmail() {
  const [state, setState] = useState<State>({ kind: "checking" });
  useLinkToken((token) => {
    if (!token) {
      setState({ kind: "failed", message: NO_TOKEN_MESSAGE });
      return;
    }
    apiVerifyEmail(token).then((result) =>
      setState(result.ok ? { kind: "verified", message: result.data.message } : { kind: "failed", message: result.message }),
    );
  });

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
