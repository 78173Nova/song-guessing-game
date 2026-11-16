// POST /api/accounts/login – log in and start a session (sets the session cookie). The steps live in lib/api/accounts.ts.
import { logIn, safely } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request) {
  const result = await safely(async () => logIn(getDb(), await request.text()));
  const headers = result.setCookie ? { "Set-Cookie": result.setCookie } : undefined;
  return Response.json(result.body, { status: result.status, headers });
}
