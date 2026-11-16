"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiLogOut, apiWhoIsLoggedIn } from "@/lib/client/account-api";
import styles from "./Landing.module.css";

// The account part of the landing page: Log in / Sign up, or "Logged in as <username>" and Log out.
// The session cookie cannot be read by page JavaScript, so the page asks the server who is logged in.
export default function AccountButtons() {
  // undefined while asking the server, null when nobody is logged in.
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    apiWhoIsLoggedIn().then(setUsername);
  }, []);

  async function logOut() {
    setError("");
    const result = await apiLogOut();
    if (result.ok) setUsername(null);
    else setError(result.message);
  }

  // Keeps the space, so the page does not jump when the answer arrives.
  if (username === undefined) return <div className={styles.accountButtons} aria-busy="true" />;

  if (username === null) {
    return (
      <div className={styles.accountButtons}>
        <Link href="/login" className={styles.secondary}>
          Log in
        </Link>
        <Link href="/signup" className={styles.primary}>
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.accountButtons}>
        <p className={styles.loggedIn}>
          Logged in as <strong>{username}</strong>
        </p>
        <button type="button" className={styles.secondary} onClick={logOut}>
          Log out
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
