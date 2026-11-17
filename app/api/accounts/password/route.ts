// POST /api/accounts/password – change the logged-in account's password (needs the current password). The steps live in lib/api/accounts.ts.
import type { NextRequest } from "next/server";
import { changePassword, readRequestBody, safely, SESSION_COOKIE } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const result = await safely(async () => changePassword(getDb(), session, await readRequestBody(request)));
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
