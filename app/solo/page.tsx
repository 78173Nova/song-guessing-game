import Link from "next/link";
import SoloGame from "@/components/SoloGame";
import styles from "../page.module.css";

export const metadata = { title: "Play solo · Song Guessing Game" };

// The solo game, unchanged – it used to be the front page.
export default function SoloPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link href="/" className={styles.back}>
          ← Home
        </Link>
        <h1 className={styles.heading}>Song Guessing Game</h1>
        <SoloGame />
      </main>
      <footer className={styles.footer}>Previews provided courtesy of iTunes</footer>
    </div>
  );
}
