// POST /api/rooms – an account holder creates a room with { nickname, settings?, private? }.
// GET /api/rooms?type=multiplayer&mode=any&genres=any&decades=any – the "Join a room" list of public rooms (issue #36).
// The steps live in lib/api/rooms.ts. The session cookie says who is logged in; only an account holder can create a room.
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/api/accounts";
import { safely } from "@/lib/api/games";
import { createNewRoom, listPublicRooms } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const result = await safely(async () => createNewRoom(getDb(), session, await request.text()));
  return Response.json(result.body, { status: result.status });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await safely(() => listPublicRooms(getDb(), params));
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
