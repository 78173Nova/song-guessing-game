// GET /api/rooms/[code] – the room state for the host or a player. The steps live in lib/api/rooms.ts.
// The token comes in the Authorization header, never in the URL.
import { safely } from "@/lib/api/games";
import { getRoomState } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const { code } = await ctx.params;
  const result = await safely(() => getRoomState(getDb(), code, request.headers.get("authorization")));
  // "no-store": the state changes every second and differs per viewer, so nothing may keep a copy of it.
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
