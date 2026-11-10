// POST /api/games/[id]/replace – swap the song of a round whose clip would not load. Steps in lib/api/games.ts.
import { replaceRoundSong, safely } from "@/lib/api/games";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/replace">) {
  const { id } = await ctx.params;
  const result = await safely(async () => replaceRoundSong(getDb(), id, await request.text()));
  return Response.json(result.body, { status: result.status });
}
