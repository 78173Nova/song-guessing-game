// POST /api/accounts/forgot-password – ask for a password reset link. The steps live in lib/api/accounts.ts.
import { forgotPassword, safely } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request) {
  const result = await safely(async () => forgotPassword(getDb(), await request.text()));
  return Response.json(result.body, { status: result.status });
}
