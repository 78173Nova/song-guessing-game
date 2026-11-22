import Link from "next/link";
import CreateRoomForm from "@/components/CreateRoomForm";
import shared from "@/components/GameShared.module.css";
import selection from "@/components/RoomSelection.module.css";
import ArrowLeftIcon from "@/components/icons/ArrowLeftIcon";
import frame from "../page.module.css";

export const metadata = { title: "Create a room · Song Guessing Game" };

// Create a room (issue #32). Only for account holders: CreateRoomForm asks a guest to log in or sign up first.
// Same frame as the solo start screen: small header, then one column straight on the page background.
export default function CreatePage() {
  return (
    <div className={frame.page}>
      <main className={frame.main}>
        <header className={frame.header}>
          <Link href="/" className={frame.back}>
            <ArrowLeftIcon /> Home
          </Link>
          <h1 className={frame.heading}>Create a room</h1>
        </header>
        <div className={shared.game}>
          <section className={shared.center}>
            <div className={selection.selection}>
              <CreateRoomForm />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
