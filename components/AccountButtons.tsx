"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiLogOut, apiWhoIsLoggedIn } from "@/lib/client/account-api";
import { showError } from "./messages";
import styles from "./Landing.module.css";

// The account part of the landing page: Log in / Sign up, or "Logged in as <username>" and Log out. The username
// links to Account settings (issue #44).
// The session cookie cannot be read by page JavaScript, so the page asks the server who is logged in.
export default function AccountButtons() {
  // undefined while asking the server, null when nobody is logged in.
  const [username, setUsername] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    apiWhoIsLoggedIn().then(setUsername);
  }, []);

  async function logOut() {
    const result = await apiLogOut();
    if (result.ok) setUsername(null);
    else showError(result.message); // a short message (#62): it is not about a form field
  }

  // Keeps the space, so the page does not jump when the answer arrives.
  if (username === undefined) return <div className={styles.accountButtons} aria-busy="true" />;

  if (username === null) {
    return (
      <div className={styles.accountButtons}>
        <Link href="/login" className={styles.quiet}>
          Log in
        </Link>
        <Link href="/signup" className={styles.quiet}>
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.accountButtons}>
      <p className={styles.loggedIn}>
        Logged in as{" "}
        <Link href="/account" className={styles.accountLink} title="Account settings">
          <strong>{username}</strong>
        </Link>
      </p>
      <button type="button" className={styles.quiet} onClick={logOut}>
        Log out
      </button>
    </div>
  );
}
