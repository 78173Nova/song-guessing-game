// POST /api/games/[id]/next – get the next round. The steps live in lib/api/games.ts.
import { safely, sendNextRound } from "@/lib/api/games";
import { getDb } from "@/lib/db/client";

export async function POST(_request: Request, ctx: RouteContext<"/api/games/[id]/next">) {
  const { id } = await ctx.params;
  const result = await safely(() => sendNextRound(getDb(), id));
  return Response.json(result.body, { status: result.status });
}
