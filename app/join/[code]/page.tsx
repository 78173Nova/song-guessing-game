import { Suspense } from "react";
import ComingSoon from "@/components/ComingSoon";
import Room from "@/components/Room";
import styles from "@/components/Landing.module.css";
import { parseRoomCode, ROOM_CODE_RULE } from "@/lib/client/room-code";
import { appUrl } from "@/lib/email/messages";

export const metadata = { title: "Room · SongSnap" };

// One room: /join/<code>, from the room code box or a shared link. The code comes from the address bar,
// so it is checked again here: someone can type any address by hand. The server checks it once more.
// The page itself does not wait for the code (Next.js prerenders it); only RoomForCode does.
export default function JoinCodePage({ params }: PageProps<"/join/[code]">) {
  return (
    <Suspense fallback={<ComingSoon title="Joining…" text="One moment." />}>
      <RoomForCode params={params} />
    </Suspense>
  );
}

async function RoomForCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  if (parseRoomCode(code) === null) {
    return <ComingSoon title="That is not a room code" text={ROOM_CODE_RULE} />;
  }
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Room</h1>
        {/* The share link uses the configured address, never the request's Host header (see appUrl). */}
        <Room code={code} appAddress={appUrl()} />
      </main>
    </div>
  );
}
