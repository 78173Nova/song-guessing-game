// GET /api/rooms/matching-songs?genres=pop,rock&decades=1980 – how many songs match while the room creator chooses
// the settings (issue #34). The steps live in lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { countMatchingSongs } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await safely(() => countMatchingSongs(getDb(), params));
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
