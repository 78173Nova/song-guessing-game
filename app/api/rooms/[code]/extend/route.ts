// POST /api/rooms/[code]/extend – the room creator adds 60 s to the lobby countdown (issue #37). The steps live in
// lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { extendRoomCountdown } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/extend">) {
  const { code } = await ctx.params;
  const result = await safely(() => extendRoomCountdown(getDb(), code, request.headers.get("authorization")));
  return Response.json(result.body, { status: result.status });
}
