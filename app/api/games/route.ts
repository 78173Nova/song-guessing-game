// POST /api/games – start a game (optional body: {"mode": "title" | "artist" | "year" | "mixed"}).
// The steps live in lib/api/games.ts.
import { safely, startGame } from "@/lib/api/games";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request) {
  const result = await safely(async () => startGame(getDb(), Math.random, await request.text()));
  return Response.json(result.body, { status: result.status });
}
