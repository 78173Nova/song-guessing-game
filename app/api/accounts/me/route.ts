// GET /api/accounts/me – who is logged in with this browser's session cookie. The steps live in lib/api/accounts.ts.
import type { NextRequest } from "next/server";
import { safely, SESSION_COOKIE, whoIsLoggedIn } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const result = await safely(async () => whoIsLoggedIn(getDb(), request.cookies.get(SESSION_COOKIE)?.value));
  // The answer belongs to this browser only and changes on log in and log out, so it is never cached.
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
