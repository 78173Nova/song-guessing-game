import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";
import MessageArea from "@/components/MessageArea";
import "./globals.css";

// Fonts from DESIGN.md: Bricolage Grotesque for titles and numbers, Atkinson Hyperlegible Next for everything
// people read or type. app/globals.css turns these variables into --font-display and --font-body.
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

const body = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SongSnap",
  description: "SongSnap: hear a song and pick the right answer within 15 seconds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        {/* Short messages ("Link copied", network errors), once for every page (issue #62). */}
        <MessageArea />
      </body>
    </html>
  );
}
