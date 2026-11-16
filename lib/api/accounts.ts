// What each account route does, step by step: validate the input, apply the rules from lib/accounts, save,
// send the email, and build the reply. The route files in app/api/accounts/ only call these functions.
// The database, the clock, the email sender and the token maker are passed in, so the tests can use PGlite,
// a fake clock, a fake sender and predictable tokens.
import {
  checkPassword,
  createToken,
  hashPassword,
  parseLoginInput,
  parseSignupInput,
  SESSION_LIFETIME_MS,
  VERIFY_LINK_LIFETIME_MS,
} from "../accounts/rules";
import type { TransactionDb } from "../db/client";
import {
  createPendingAccount,
  createSession,
  deleteSession,
  findAccountForLogin,
  findSessionUsername,
  redeemVerifyToken,
} from "../db/accounts";
import { alreadyHaveAccountMessage, appUrl, linkWithToken, verifyEmailMessage } from "../email/messages";
import { getEmailSender, type EmailSender } from "../email/sender";

// setCookie is the value of a Set-Cookie header for the route to send (log in, log out). It is the only place a
// session token leaves the server; the body never contains one.
export type ApiResult = { status: number; body: Record<string, unknown>; setCookie?: string };

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
  "wrong-login": { status: 401, message: "Wrong username/email or password" },
  "not-verified": { status: 403, message: "Verify your email first" },
  "link-unknown": { status: 404, message: "This link is not valid. Please use the newest link we sent you." },
  "link-used": { status: 410, message: "This link was already used. If your email is verified, you can log in." },
  "link-expired": { status: 410, message: "This link has expired. Please sign up again to get a new one." },
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
    // The email belongs to a verified account: nothing is created, the owner of that inbox is told, and the
    // reply stays the same, so the page never reveals that the email is registered.
    if (created.reason === "email_verified") {
      await sendEmail(alreadyHaveAccountMessage(email, `${appUrl()}/forgot-password`));
    }
    return { status: 200, body: { message: CHECK_INBOX_MESSAGE } };
  }

  // Delivery problems are handled with the real email service (issue #25).
  await sendEmail(verifyEmailMessage(email, linkWithToken("/verify-email", verifyToken)));
  return { status: 200, body: { message: CHECK_INBOX_MESSAGE } };
}

const VERIFIED_MESSAGE = "Your email is verified – you can log in now";

// Link tokens are 43 characters; anything much longer is not one of ours.
const MAX_TOKEN_LENGTH = 200;

// POST /api/accounts/verify-email – opens the link from the verification email: { token } → verified.
export async function verifyEmail(db: TransactionDb, rawBody: string, deps: AccountDeps = {}): Promise<ApiResult> {
  const now = (deps.now ?? (() => new Date()))();

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const token = (json.body as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return fail("malformed");

  const result = await redeemVerifyToken(db, token, now);
  if (!result.ok) return fail(`link-${result.reason}`);
  return { status: 200, body: { message: VERIFIED_MESSAGE } };
}

// The session cookie: page JavaScript cannot read it (HttpOnly), it is sent only over HTTPS (Secure; browsers
// also allow it on http://localhost), not with requests started by other sites (SameSite=Lax), for the whole
// site (Path=/), and it lasts as long as the session.
export const SESSION_COOKIE = "session";

// Max-Age 0 tells the browser to delete the cookie (log out).
function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

// POST /api/accounts/login – { login, password } → starts a session and replies with the username.
// A login with @ is an email, otherwise a username; both ignore case. A wrong password and an unknown account
// get the same reply and take the same time, so the page never reveals whether an account exists.
export async function logIn(db: TransactionDb, rawBody: string, deps: AccountDeps = {}): Promise<ApiResult> {
  const now = (deps.now ?? (() => new Date()))();
  const makeToken = deps.makeToken ?? createToken;

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const parsed = parseLoginInput(json.body);
  if (!parsed.ok) return fail("malformed");
  const { by, value, password } = parsed.input;

  const account = await findAccountForLogin(db, by, value);
  // With no account a dummy hash is checked, so this takes as long as a wrong password.
  if (!(await checkPassword(password, account?.passwordHash ?? null)) || !account) return fail("wrong-login");
  if (!account.verified) return fail("not-verified");

  const token = makeToken();
  await createSession(db, {
    token,
    userId: account.id,
    now,
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
  });
  const setCookie = sessionCookie(token, SESSION_LIFETIME_MS / 1000);
  return { status: 200, body: { username: account.username }, setCookie };
}

// GET /api/accounts/me – who is logged in with this session cookie: { username }, or { username: null } for a
// missing, unknown or expired session.
export async function whoIsLoggedIn(
  db: TransactionDb,
  sessionToken: string | undefined,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const now = (deps.now ?? (() => new Date()))();
  if (!sessionToken || sessionToken.length > MAX_TOKEN_LENGTH) return { status: 200, body: { username: null } };
  return { status: 200, body: { username: await findSessionUsername(db, sessionToken, now) } };
}

// POST /api/accounts/logout – ends this browser's session on the server and clears the cookie. Always works,
// even without a session, so the browser always ends up logged out.
export async function logOut(db: TransactionDb, sessionToken: string | undefined): Promise<ApiResult> {
  if (sessionToken && sessionToken.length <= MAX_TOKEN_LENGTH) await deleteSession(db, sessionToken);
  return { status: 200, body: { username: null }, setCookie: sessionCookie("", 0) };
}
