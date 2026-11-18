import Link from "next/link";
import CreateRoomForm from "@/components/CreateRoomForm";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Create a room · Song Guessing Game" };

// Create a room (issue #32). Only for account holders: CreateRoomForm sends a guest to log in first.
export default function CreatePage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Create a room</h1>
        <CreateRoomForm />
        <Link href="/" className={styles.textLink}>
          <ArrowLeftIcon /> Back to the front page
        </Link>
      </main>
    </div>
  );
}
