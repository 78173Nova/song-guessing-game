"use client";

import { useState } from "react";
import Link from "next/link";
import { apiConfirmEmailChange } from "@/lib/client/account-api";
import { useLinkToken } from "@/lib/client/useLinkToken";
import styles from "./Landing.module.css";

type State = { kind: "checking" } | { kind: "changed"; message: string } | { kind: "failed"; message: string };

const NO_TOKEN_MESSAGE = "This link is not complete. Please open the link from the email again.";

// The page the link of an email change opens (issue #45). Like VerifyEmail: reads the token from the address bar
// once (useLinkToken removes it from there), sends it to the server and shows the reply.
export default function ConfirmEmailChange() {
  const [state, setState] = useState<State>({ kind: "checking" });
  useLinkToken((token) => {
    if (!token) {
      setState({ kind: "failed", message: NO_TOKEN_MESSAGE });
      return;
    }
    apiConfirmEmailChange(token).then((result) =>
      setState(result.ok ? { kind: "changed", message: result.data.message } : { kind: "failed", message: result.message }),
    );
  });

  if (state.kind === "checking") {
    return (
      <p className={styles.pitch} role="status">
        Checking your link…
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
    <p className={styles.error} role="alert">
      {state.message}
    </p>
  );
}
