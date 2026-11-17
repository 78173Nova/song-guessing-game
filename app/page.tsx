import Link from "next/link";
import AccountButtons from "@/components/AccountButtons";
import RoomCodeForm from "@/components/RoomCodeForm";
import styles from "@/components/Landing.module.css";

// The front page: what the game is, and every way in (solo, room code, account).
export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Song Guessing Game</h1>
        <p className={styles.pitch}>Hear a few seconds of a hit song. Name it before anyone else does.</p>

        <ul className={styles.points}>
          <li>
            <span aria-hidden="true">🎧</span> Listen to a short clip of a well-known song
          </li>
          <li>
            <span aria-hidden="true">⚡</span> Pick the right answer – the faster you are, the more points you get
          </li>
          <li>
            <span aria-hidden="true">👥</span> Play solo, or join friends in a room with a code
          </li>
        </ul>

        <AccountButtons />

        <RoomCodeForm />

        <Link href="/solo" className={styles.textLink}>
          Play solo →
        </Link>
      </main>
    </div>
  );
}
