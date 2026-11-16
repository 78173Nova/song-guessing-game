// POST /api/rooms/[code]/replace – the host swaps the song of a round whose clip would not load.
// The steps live in lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { replaceRoomSong } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/replace">) {
  const { code } = await ctx.params;
  const result = await safely(async () =>
    replaceRoomSong(getDb(), code, request.headers.get("authorization"), await request.text()),
  );
  return Response.json(result.body, { status: result.status });
}
