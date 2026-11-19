import Link from "next/link";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import styles from "./Landing.module.css";

// A placeholder page for parts that are not built yet, with a way back to the front page.
export default function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.pitch}>{text}</p>
        <Link href="/" className={styles.textLink}>
          <ArrowLeftIcon /> Back to the front page
        </Link>
      </main>
    </div>
  );
}
