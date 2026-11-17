import { Suspense } from "react";
import ComingSoon from "@/components/ComingSoon";
import { parseRoomCode, ROOM_CODE_RULE } from "@/lib/client/room-code";

export const metadata = { title: "Join a room · Song Guessing Game" };

// Placeholder until the room pages (spec 002) exist. The code comes from the address bar,
// so it is checked again here: someone can type any address by hand.
// The page itself does not wait for the code (Next.js prerenders it); only RoomPlaceholder does.
export default function JoinPage({ params }: PageProps<"/join/[code]">) {
  return (
    <Suspense fallback={<ComingSoon title="Joining…" text="One moment." />}>
      <RoomPlaceholder params={params} />
    </Suspense>
  );
}

async function RoomPlaceholder({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  if (parseRoomCode(code) === null) {
    return <ComingSoon title="That is not a room code" text={ROOM_CODE_RULE} />;
  }
  return <ComingSoon title={`Room ${code}`} text="Rooms are coming soon. For now, try a solo game." />;
}
