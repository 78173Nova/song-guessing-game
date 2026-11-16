// POST /api/accounts/signup – create an account that is not verified yet. The steps live in lib/api/accounts.ts.
import { safely, signUp, readRequestBody } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request) {
  const result = await safely(async () => signUp(getDb(), await readRequestBody(request)));
  return Response.json(result.body, { status: result.status });
}
