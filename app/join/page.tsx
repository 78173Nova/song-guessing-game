import Link from "next/link";
import RoomCodeForm from "@/components/RoomCodeForm";
import RoomList from "@/components/RoomList";
import shared from "@/components/GameShared.module.css";
import selection from "@/components/RoomSelection.module.css";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import frame from "../page.module.css";

export const metadata = { title: "Join a room · Song Guessing Game" };

// "Join a room": the room code box and the list of public rooms (issue #36). Private rooms are only reached by code,
// link or QR code. Same frame as the solo start screen: small header, then one column straight on the page background.
export default function JoinPage() {
  return (
    <div className={frame.page}>
      <main className={frame.main}>
        <header className={frame.header}>
          <Link href="/" className={frame.back}>
            <ArrowLeftIcon /> Home
          </Link>
          <h1 className={frame.heading}>Join a room</h1>
        </header>
        <div className={shared.game}>
          <section className={shared.center}>
            <p className={shared.intro}>Type the room code you got from a friend, or pick a public room below.</p>
            <div className={selection.selection}>
              <RoomCodeForm />
              <RoomList />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
