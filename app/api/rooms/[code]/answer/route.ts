// POST /api/rooms/[code]/answer – a player answers the open round. The steps live in lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { answerRoomRound } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/answer">) {
  const { code } = await ctx.params;
  const result = await safely(async () =>
    answerRoomRound(getDb(), code, request.headers.get("authorization"), await request.text()),
  );
  return Response.json(result.body, { status: result.status });
}
