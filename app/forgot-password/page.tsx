import Link from "next/link";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Forgot password · Song Guessing Game" };

// Ask for a password reset link by email (spec 004). Linked from /login and from the "already have an account" email.
export default function ForgotPasswordPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Forgot password</h1>
        <p className={styles.pitch}>Enter the email of your account and we send you a link to choose a new password.</p>
        <ForgotPasswordForm />
        <Link href="/" className={styles.textLink}>
          ← Back to the front page
        </Link>
      </main>
    </div>
  );
}
