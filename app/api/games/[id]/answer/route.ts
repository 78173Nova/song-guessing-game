// POST /api/games/[id]/answer – answer the current round. The steps live in lib/api/games.ts.
import { answerRound, safely } from "@/lib/api/games";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/answer">) {
  const { id } = await ctx.params;
  const result = await safely(async () => answerRound(getDb(), id, await request.text()));
  return Response.json(result.body, { status: result.status });
}
