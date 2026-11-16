// POST /api/rooms/[code]/start – the host starts the game. The steps live in lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { startRoomGame } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  const { code } = await ctx.params;
  const result = await safely(() => startRoomGame(getDb(), code, request.headers.get("authorization")));
  return Response.json(result.body, { status: result.status });
}
