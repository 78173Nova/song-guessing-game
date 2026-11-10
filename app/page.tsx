import SoloGame from "@/components/SoloGame";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.heading}>Song Guessing Game</h1>
        <SoloGame />
      </main>
      <footer className={styles.footer}>Previews provided courtesy of iTunes</footer>
    </div>
  );
}
