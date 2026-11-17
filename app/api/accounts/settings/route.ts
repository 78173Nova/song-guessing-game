// GET /api/accounts/settings – the logged-in account's avatar and usual nickname.
// POST /api/accounts/settings – change them. The steps live in lib/api/accounts.ts.
import type { NextRequest } from "next/server";
import { getAccountSettings, readRequestBody, safely, saveAccountSettings, SESSION_COOKIE } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

// The answer belongs to this account only and changes when it is saved, so it is never cached.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const result = await safely(async () => getAccountSettings(getDb(), request.cookies.get(SESSION_COOKIE)?.value));
  return Response.json(result.body, { status: result.status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const result = await safely(async () => saveAccountSettings(getDb(), session, await readRequestBody(request)));
  return Response.json(result.body, { status: result.status, headers: NO_STORE });
}
