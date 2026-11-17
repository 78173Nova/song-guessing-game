// POST /api/accounts/username – give the logged-in account a new username. The steps live in lib/api/accounts.ts.
import type { NextRequest } from "next/server";
import { changeUsername, readRequestBody, safely, SESSION_COOKIE } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const result = await safely(async () => changeUsername(getDb(), session, await readRequestBody(request)));
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
