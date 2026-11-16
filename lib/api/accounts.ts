// What each account route does, step by step: validate the input, apply the rules from lib/accounts, save,
// send the email, and build the reply. The route files in app/api/accounts/ only call these functions.
// The database, the clock, the email sender and the token maker are passed in, so the tests can use PGlite,
// a fake clock, a fake sender and predictable tokens.
import { createToken, hashPassword, parseSignupInput, VERIFY_LINK_LIFETIME_MS } from "../accounts/rules";
import type { TransactionDb } from "../db/client";
import { createPendingAccount } from "../db/accounts";
import { linkWithToken, verifyEmailMessage } from "../email/messages";
import { getEmailSender, type EmailSender } from "../email/sender";

export type ApiResult = { status: number; body: Record<string, unknown> };

export type AccountDeps = {
  now?: () => Date;
  sendEmail?: EmailSender;
  makeToken?: () => string;
};

// Sign-up bodies are small (email up to 254, password up to 128 characters). Anything bigger is refused
// before parsing.
const MAX_BODY_LENGTH = 2000;

const CHECK_INBOX_MESSAGE = "Check your inbox to finish signing up";

const ERRORS = {
  malformed: { status: 400, message: "The request is not valid." },
  "invalid-email": { status: 400, message: "Please enter a valid email address." },
  "invalid-username": {
    status: 400,
    message: "Usernames are 3–20 characters long and use only letters, digits and _.",
  },
  "invalid-password": { status: 400, message: "Passwords are 8–128 characters long." },
  "username-taken": { status: 409, message: "This username is taken" },
  "server-error": { status: 500, message: "Something went wrong on the server. Please try again." },
} as const;

type ErrorCode = keyof typeof ERRORS;

function fail(error: ErrorCode): ApiResult {
  return { status: ERRORS[error].status, body: { error, message: ERRORS[error].message } };
}

// Reads a small JSON body; not ok if it is too long or not JSON.
function readJson(rawBody: string): { ok: true; body: unknown } | { ok: false } {
  if (rawBody.length > MAX_BODY_LENGTH) return { ok: false };
  try {
    return { ok: true, body: JSON.parse(rawBody) };
  } catch {
    return { ok: false };
  }
}

// Runs a request and turns any unexpected error into a 500 with a generic message. The details go to the
// server log only, never to the browser.
export async function safely(run: () => Promise<ApiResult>): Promise<ApiResult> {
  try {
    return await run();
  } catch (error) {
    console.error("Accounts API error:", error);
    return fail("server-error");
  }
}

// POST /api/accounts/signup – creates an account that is not verified yet and sends the verification link.
// A valid sign-up always gets the same reply, so the page never reveals whether an email is registered.
export async function signUp(db: TransactionDb, rawBody: string, deps: AccountDeps = {}): Promise<ApiResult> {
  const now = (deps.now ?? (() => new Date()))();
  const sendEmail = deps.sendEmail ?? getEmailSender();
  const makeToken = deps.makeToken ?? createToken;

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const parsed = parseSignupInput(json.body);
  if (!parsed.ok) return fail(parsed.error);
  const { email, username, password } = parsed.input;

  const verifyToken = makeToken();
  const created = await createPendingAccount(db, {
    email,
    username,
    passwordHash: await hashPassword(password),
    verifyToken,
    verifyExpiresAt: new Date(now.getTime() + VERIFY_LINK_LIFETIME_MS),
    now,
  });

  if (!created.ok) {
    if (created.reason === "username_taken") return fail("username-taken");
    // The email belongs to a verified account: nothing is created and the reply stays the same.
    // (Issue #26 adds the "you already have an account" email here.)
    return { status: 200, body: { message: CHECK_INBOX_MESSAGE } };
  }

  // Delivery problems are handled with the real email service (issue #25).
  await sendEmail(verifyEmailMessage(email, linkWithToken("/verify-email", verifyToken)));
  return { status: 200, body: { message: CHECK_INBOX_MESSAGE } };
}
