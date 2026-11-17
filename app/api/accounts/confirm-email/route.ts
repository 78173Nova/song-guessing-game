// POST /api/accounts/confirm-email – open the link sent to the new address of an email change. The steps live in
// lib/api/accounts.ts.
import { confirmEmailChange, readRequestBody, safely } from "@/lib/api/accounts";
import { getDb } from "@/lib/db/client";

export async function POST(request: Request) {
  const result = await safely(async () => confirmEmailChange(getDb(), await readRequestBody(request)));
  return Response.json(result.body, { status: result.status });
}
