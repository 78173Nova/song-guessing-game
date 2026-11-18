import Link from "next/link";
import RoomCodeForm from "@/components/RoomCodeForm";
import RoomList from "@/components/RoomList";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import styles from "@/components/Landing.module.css";

export const metadata = { title: "Join a room · Song Guessing Game" };

// "Join a room": the room code box and the list of public rooms (issue #36). Private rooms are only reached by code,
// link or QR code.
export default function JoinPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Join a room</h1>
        <p className={styles.pitch}>Type the room code you got from a friend, or pick a public room below.</p>
        <RoomCodeForm />
        <RoomList />
        <Link href="/" className={styles.textLink}>
          <ArrowLeftIcon /> Back to the front page
        </Link>
      </main>
    </div>
  );
}
