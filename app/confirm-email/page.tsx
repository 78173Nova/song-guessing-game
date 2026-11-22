import Link from "next/link";
import ConfirmEmailChange from "@/components/ConfirmEmailChange";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Confirm your new email · SongSnap" };

// The page the email-change email links to (/confirm-email?token=…, issue #45). The token is handled in the
// browser by ConfirmEmailChange, which sends it to the server and removes it from the address bar.
export default function ConfirmEmailChangePage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Confirm your new email</h1>
        <ConfirmEmailChange />
        <Link href="/" className={styles.textLink}>
          <ArrowLeftIcon /> Back to the front page
        </Link>
      </main>
    </div>
  );
}
