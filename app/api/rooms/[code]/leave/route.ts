// POST /api/rooms/[code]/leave – a player leaves the room (issue #40). The steps live in lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { playerLeavesRoom } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) {
  const { code } = await ctx.params;
  const result = await safely(() => playerLeavesRoom(getDb(), code, request.headers.get("authorization")));
  return Response.json(result.body, { status: result.status });
}
