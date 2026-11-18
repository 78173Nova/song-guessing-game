// GET /api/games/matching-songs?genre=rock&decade=1980 – songs, different titles and different artists for the
// solo start screen (issue #7). The steps live in lib/api/games.ts.
import { getMatchingSongs, safely } from "@/lib/api/games";
import { getDb } from "@/lib/db/client";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await safely(() => getMatchingSongs(getDb(), params));
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
