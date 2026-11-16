// POST /api/rooms/[code]/join – join a room with a nickname. The steps live in lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { joinRoom } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  const { code } = await ctx.params;
  const result = await safely(async () => joinRoom(getDb(), code, await request.text()));
  return Response.json(result.body, { status: result.status });
}
