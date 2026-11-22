import Link from "next/link";
import ResetPasswordForm from "@/components/ResetPasswordForm";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Choose a new password · SongSnap" };

// The page the reset email links to (/reset-password?token=…). The token is handled in the browser by
// ResetPasswordForm, which removes it from the address bar and sends it with the new password.
export default function ResetPasswordPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Choose a new password</h1>
        <ResetPasswordForm />
        <Link href="/" className={styles.textLink}>
          <ArrowLeftIcon /> Back to the front page
        </Link>
      </main>
    </div>
  );
}
