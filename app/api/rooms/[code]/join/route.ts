// POST /api/rooms/[code]/join – join a room with a nickname. The steps live in lib/api/rooms.ts.
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/api/accounts";
import { safely } from "@/lib/api/games";
import { joinRoom } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/rooms/[code]/join">) {
  const { code } = await ctx.params;
  // The Authorization header carries the token this tab had before, if any (a kicked player is refused, issue #40).
  // Guests can join too; the session cookie of an account holder decides the avatar (issue #44) and lets them take
  // over the room creator role after a game (issue #43).
  const from = {
    authorization: request.headers.get("authorization"),
    sessionToken: request.cookies.get(SESSION_COOKIE)?.value,
  };
  const result = await safely(async () => joinRoom(getDb(), code, await request.text(), {}, from));
  return Response.json(result.body, { status: result.status });
}
