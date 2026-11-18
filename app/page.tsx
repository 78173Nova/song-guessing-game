import Link from "next/link";
import AccountButtons from "@/components/AccountButtons";
import RoomCodeForm from "@/components/RoomCodeForm";
import WaveCircle from "@/components/WaveCircle";
import BoltIcon from "@/components/icons/BoltIcon";
import HeadphonesIcon from "@/components/icons/HeadphonesIcon";
import PeopleIcon from "@/components/icons/PeopleIcon";
import styles from "@/components/Landing.module.css";

// The front page: what the game is, and every way in (solo, create a room, join a room, room code, account).
// Layout from DESIGN.md: the wave circle above the title (left of it on a laptop), then one filled button.
export default function Home() {
  return (
    <div className={styles.landing}>
      <main className={styles.landingMain}>
        {/* The wave circle idles in the app colours: no analyser (no sound here) and no colours. */}
        <div className={styles.circleSlot}>
          <WaveCircle />
        </div>

        <div className={styles.landingColumn}>
          <h1 className={styles.landingTitle}>Song Guessing Game</h1>
          <p className={styles.landingPitch}>Hear a few seconds of a hit song. Name it before anyone else does.</p>

          <ul className={styles.points}>
            <li>
              <HeadphonesIcon className={styles.pointIcon} /> Listen to a short clip of a well-known song
            </li>
            <li>
              <BoltIcon className={styles.pointIcon} /> Pick the right answer – the faster you are, the more points
              you get
            </li>
            <li>
              <PeopleIcon className={styles.pointIcon} /> Play solo, or join friends in a room with a code
            </li>
          </ul>

          <nav className={styles.mainButtons} aria-label="Ways to play">
            <Link href="/solo" className={`${styles.primary} ${styles.big}`}>
              Play solo
            </Link>
            {/* A guest is sent to log in first and comes back to /create afterwards (app/create/page.tsx). */}
            <Link href="/create" className={`${styles.secondary} ${styles.big}`}>
              Create a room
            </Link>
            <Link href="/join" className={`${styles.secondary} ${styles.big}`}>
              Join a room
            </Link>
          </nav>

          <RoomCodeForm />

          <AccountButtons />
        </div>
      </main>
    </div>
  );
}
