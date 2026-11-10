// POST /api/games – start a game. The steps live in lib/api/games.ts.
import { safely, startGame } from "@/lib/api/games";
import { getDb } from "@/lib/db/client";

export async function POST() {
  const result = await safely(() => startGame(getDb()));
  return Response.json(result.body, { status: result.status });
}
