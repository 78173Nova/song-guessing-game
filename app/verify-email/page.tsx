import Link from "next/link";
import VerifyEmail from "@/components/VerifyEmail";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Verify your email · SongSnap" };

// The page the verification email links to (/verify-email?token=…). The token is handled in the browser by
// VerifyEmail, which sends it to the server and removes it from the address bar.
export default function VerifyEmailPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Verify your email</h1>
        <VerifyEmail />
        <Link href="/" className={styles.textLink}>
          <ArrowLeftIcon /> Back to the front page
        </Link>
      </main>
    </div>
  );
}
