// POST /api/accounts/resend-verification – send a new verification link. The steps live in lib/api/accounts.ts.
import { resendVerification, safely } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request) {
  const result = await safely(async () => resendVerification(getDb(), await request.text()));
  return Response.json(result.body, { status: result.status });
}
