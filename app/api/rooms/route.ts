// POST /api/rooms – create a room. The steps live in lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { createNewRoom } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST() {
  const result = await safely(() => createNewRoom(getDb()));
  return Response.json(result.body, { status: result.status });
}
