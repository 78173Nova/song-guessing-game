// POST /api/rooms – an account holder creates a room with { nickname }. The steps live in lib/api/rooms.ts.
// The session cookie says who is logged in; only an account holder can create a room.
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/api/accounts";
import { safely } from "@/lib/api/games";
import { createNewRoom } from "@/lib/api/rooms";
import { getDb } from "@/lib/db/client";

export async function POST(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const result = await safely(async () => createNewRoom(getDb(), session, await request.text()));
  return Response.json(result.body, { status: result.status });
}
