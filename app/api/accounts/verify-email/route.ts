// POST /api/accounts/verify-email – open the link from the verification email. The steps live in lib/api/accounts.ts.
import { safely, verifyEmail } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request) {
  const result = await safely(async () => verifyEmail(getDb(), await request.text()));
  return Response.json(result.body, { status: result.status });
}
