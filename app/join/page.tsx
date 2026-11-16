import Link from "next/link";
import RoomCodeForm from "@/components/RoomCodeForm";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Join a room · Song Guessing Game" };

// "Join a room": for now only the room code box. The list of public rooms comes in a later ticket (#36).
export default function JoinPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Join a room</h1>
        <p className={styles.pitch}>Type the room code you got from a friend, or open the link they sent you.</p>
        <RoomCodeForm />
        <Link href="/" className={styles.textLink}>
          ← Back to the front page
        </Link>
      </main>
    </div>
  );
}
