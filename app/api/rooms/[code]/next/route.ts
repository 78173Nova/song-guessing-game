// POST /api/rooms/[code]/next – the host opens the next round. The steps live in lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { openNextRound } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/next">) {
  const { code } = await ctx.params;
  const result = await safely(() => openNextRound(getDb(), code, request.headers.get("authorization")));
  return Response.json(result.body, { status: result.status });
}
