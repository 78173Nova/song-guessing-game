import Link from "next/link";
import AccountSettingsForm from "@/components/AccountSettingsForm";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Account settings · Song Guessing Game" };

// Account settings (issue #44): the saved avatar and usual nickname. Reached from "Logged in as <username>" on the
// front page. Only for a logged-in account: AccountSettingsForm sends a guest to log in first.
export default function AccountPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Account settings</h1>
        <AccountSettingsForm />
        <Link href="/" className={styles.textLink}>
          ← Back to the front page
        </Link>
      </main>
    </div>
  );
}
