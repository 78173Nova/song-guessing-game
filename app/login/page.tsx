import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Log in · SongSnap" };

// Log in with a username or email and a password (spec 004).
export default function LoginPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Log in</h1>
        <LoginForm />
        <Link href="/" className={styles.textLink}>
          <ArrowLeftIcon /> Back to the front page
        </Link>
      </main>
    </div>
  );
}
