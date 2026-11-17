// POST /api/accounts/email – start changing the logged-in account's email (needs the current password). The steps live in lib/api/accounts.ts.
import type { NextRequest } from "next/server";
import { changeEmail, readRequestBody, safely, SESSION_COOKIE } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const result = await safely(async () => changeEmail(getDb(), session, await readRequestBody(request)));
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
