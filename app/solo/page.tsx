import Link from "next/link";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import SoloGame from "@/components/SoloGame";
import styles from "../page.module.css";

export const metadata = { title: "Play solo · SongSnap" };

// The solo game, unchanged – it used to be the front page. The header stays small, so the round (countdown,
// song area, answers) is what stands out.
export default function SoloPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <Link href="/" className={styles.back}>
            <ArrowLeftIcon /> Home
          </Link>
          <h1 className={styles.heading}>SongSnap</h1>
        </header>
        <SoloGame />
      </main>
      <footer className={styles.footer}>Previews provided courtesy of iTunes</footer>
    </div>
  );
}
