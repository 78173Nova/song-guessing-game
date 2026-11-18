// GET /api/games/song-counts – playable songs per genre and decade, for the start screen (spec 003, "filter gaps").
// The steps live in lib/api/games.ts.
import { connection } from "next/server";
import { getSongCounts, safely } from "@/lib/api/games";
import { getDb } from "@/lib/db/client";

export async function GET() {
  // Always answer at request time: without this, `next build` tries to prerender the route and query the database.
  await connection();
  const result = await safely(() => getSongCounts(getDb()));
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
