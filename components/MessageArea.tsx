"use client";

// The one place on every page where short messages appear (issue #62): "Link copied", and network or server errors
// that are not about one form field. It is Sonner's <Toaster />, mounted once in app/layout.tsx; pages show a
// message through the functions in components/messages.ts. Field errors stay next to their field.
// Sonner puts the messages in a polite live region, so screen readers read them out, and a modal pop-up does not
// hide that region from them. The colours come from the design tokens, so light and dark mode follow the system.
import { Toaster } from "sonner";
import CheckIcon from "./icons/CheckIcon";
import CrossIcon from "./icons/CrossIcon";
import styles from "./MessageArea.module.css";

export default function MessageArea() {
  return (
    <Toaster
      theme="system"
      position="bottom-right" // on phones (below 600px) Sonner stretches it across the bottom instead
      containerAriaLabel="Messages"
      className={styles.toaster}
      icons={{ success: <CheckIcon />, error: <CrossIcon /> }}
    />
  );
}
