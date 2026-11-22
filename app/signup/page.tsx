import Link from "next/link";
import SignupForm from "@/components/SignupForm";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Sign up · SongSnap" };

// Sign up: an account is needed only to create a room (spec 004).
export default function SignupPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Sign up</h1>
        <p className={styles.pitch}>You need an account only to create a room. Solo and joining stay open to everyone.</p>
        <SignupForm />
        <Link href="/" className={styles.textLink}>
          <ArrowLeftIcon /> Back to the front page
        </Link>
      </main>
    </div>
  );
}
