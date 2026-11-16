// POST /api/accounts/reset-password – set a new password with the link from the reset email. The steps live in
// lib/api/accounts.ts.
import { resetPassword, safely } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request) {
  const result = await safely(async () => resetPassword(getDb(), await request.text()));
  return Response.json(result.body, { status: result.status });
}
