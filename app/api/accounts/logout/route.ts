// POST /api/accounts/logout – end this browser's session and clear the cookie. The steps live in lib/api/accounts.ts.
import type { NextRequest } from "next/server";
import { logOut, safely, SESSION_COOKIE } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: NextRequest) {
  const result = await safely(async () => logOut(getDb(), request.cookies.get(SESSION_COOKIE)?.value));
  const headers = result.setCookie ? { "Set-Cookie": result.setCookie } : undefined;
  return Response.json(result.body, { status: result.status, headers });
}
