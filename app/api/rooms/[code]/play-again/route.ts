// POST /api/rooms/[code]/play-again – a player chooses "Play again" after a game (issue #43). The steps live in
// lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { playAgainInRoom } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/play-again">) {
  const { code } = await ctx.params;
  const result = await safely(() => playAgainInRoom(getDb(), code, request.headers.get("authorization")));
  return Response.json(result.body, { status: result.status });
}
