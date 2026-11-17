// POST /api/rooms/[code]/kick – the room creator kicks a player who has been away (issue #40). The steps live in
// lib/api/rooms.ts.
import { safely } from "@/lib/api/games";
import { kickRoomPlayer } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/kick">) {
  const { code } = await ctx.params;
  const result = await safely(async () =>
    kickRoomPlayer(getDb(), code, request.headers.get("authorization"), await request.text()),
  );
  return Response.json(result.body, { status: result.status });
}
