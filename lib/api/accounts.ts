// What each account route does, step by step: validate the input, apply the rules from lib/accounts, save,
// send the email, and build the reply. The route files in app/api/accounts/ only call these functions.
// The database, the clock, the email sender and the token maker are passed in, so the tests can use PGlite,
// a fake clock, a fake sender and predictable tokens.
import {
  checkPassword,
  createToken,
  hashPassword,
  isValidEmail,
  isValidNewPassword,
  parseForgotPasswordInput,
  parseLoginInput,
  parseSignupInput,
  RESET_LINK_LIFETIME_MS,
  SESSION_LIFETIME_MS,
  VERIFY_LINK_LIFETIME_MS,
} from "../accounts/rules";
import type { TransactionDb } from "../db/client";
import {
  claimEmailSlot,
  createPendingAccount,
  createResetToken,
  createSession,
  createVerifyToken,
  deleteSession,
  findAccountForLogin,
  findSessionUsername,
  findUnverifiedUserId,
  redeemResetToken,
  redeemVerifyToken,
} from "../db/accounts";
import {
  alreadyHaveAccountMessage,
  appUrl,
  linkWithToken,
  resetPasswordMessage,
  verifyEmailMessage,
} from "../email/messages";
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
  "too-soon": { status: 429, message: "Please wait a minute before asking for another email" },
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
    // Like every email, it is sent only if that address got none in the last minute.
    if (created.reason === "email_verified" && (await claimEmailSlot(db, created.userId, now))) {
      await sendEmail(alreadyHaveAccountMessage(email, `${appUrl()}/forgot-password`));
    }
    return { status: 200, body: { message: CHECK_INBOX_MESSAGE } };
  }

  // At most one email per address per minute. A pending account that signs up again too soon is still replaced,
  // and the reply stays the same; its new link comes with "Send the email again" a minute later.
  // Delivery problems are handled with the real email service (issue #25).
  if (await claimEmailSlot(db, created.userId, now)) {
    await sendEmail(verifyEmailMessage(email, linkWithToken("/verify-email", verifyToken)));
  }
  return { status: 200, body: { message: CHECK_INBOX_MESSAGE } };
}

const RESENT_MESSAGE = "If that address has an account that is not verified yet, we sent it a new link";

// POST /api/accounts/resend-verification – { email } → a new verification link for an account that is not
// verified yet. A verified account and an unknown address get the same reply and no email, so the reply never
// reveals whether an unverified account exists.
export async function resendVerification(
  db: TransactionDb,
  rawBody: string,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const now = (deps.now ?? (() => new Date()))();
  const sendEmail = deps.sendEmail ?? getEmailSender();
  const makeToken = deps.makeToken ?? createToken;

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const email = (json.body as { email?: unknown } | null)?.email;
  if (typeof email !== "string") return fail("malformed");
  const address = email.trim().toLowerCase();
  if (!isValidEmail(address)) return fail("invalid-email");

  const userId = await findUnverifiedUserId(db, address);
  if (userId) {
    // This 429 only tells someone who already knows the email and password that it is waiting for its first
    // click (login says "Verify your email first"); a stranger gets it only right after sending one themselves.
    if (!(await claimEmailSlot(db, userId, now))) return fail("too-soon");
    const verifyToken = makeToken();
    await createVerifyToken(db, {
      userId,
      token: verifyToken,
      expiresAt: new Date(now.getTime() + VERIFY_LINK_LIFETIME_MS),
    });
    await sendEmail(verifyEmailMessage(address, linkWithToken("/verify-email", verifyToken)));
  }
  return { status: 200, body: { message: RESENT_MESSAGE } };
}

const VERIFIED_MESSAGE ="Your email is verified – you can log in now";

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

const IF_EXISTS_MESSAGE = "If an account exists for that address, we sent an email";

// POST /api/accounts/forgot-password – { email } → sends a reset link if an account has that email.
// A known and an unknown email get the same reply, so the page never reveals whether an email is registered.
// Only a known email asked again within a minute gets "please wait" (spec 004, issue #29).
export async function forgotPassword(db: TransactionDb, rawBody: string, deps: AccountDeps = {}): Promise<ApiResult> {
  const now = (deps.now ?? (() => new Date()))();
  const sendEmail = deps.sendEmail ?? getEmailSender();
  const makeToken = deps.makeToken ?? createToken;

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const parsed = parseForgotPasswordInput(json.body);
  if (!parsed.ok) return fail(parsed.error);

  const account = await findAccountForLogin(db, "email", parsed.email);
  if (!account) return { status: 200, body: { message: IF_EXISTS_MESSAGE } };
  if (!(await claimEmailSlot(db, account.id, now))) return fail("too-soon");

  const resetToken = makeToken();
  await createResetToken(db, {
    userId: account.id,
    token: resetToken,
    expiresAt: new Date(now.getTime() + RESET_LINK_LIFETIME_MS),
  });
  // Delivery problems are handled with the real email service (issue #25).
  await sendEmail(resetPasswordMessage(parsed.email, linkWithToken("/reset-password", resetToken)));
  return { status: 200, body: { message: IF_EXISTS_MESSAGE } };
}

const PASSWORD_CHANGED_MESSAGE = "Your password is changed – you can log in now";

// The reset page's own messages for links that do not work (the verify messages talk about signing up).
const RESET_LINK_MESSAGES = {
  "link-unknown": "This link is not valid. Please use the newest link we sent you.",
  "link-used": "This link was already used. Ask for a new one on the Forgot password page if you need it.",
  "link-expired": "This link has expired. Please ask for a new one on the Forgot password page.",
} as const;

// POST /api/accounts/reset-password – { token, password } → replaces the password, ends every session of the
// account and marks its email verified. A password that breaks the 8–128 rule is refused before the link is
// used, so the person can try again with the same link.
export async function resetPassword(db: TransactionDb, rawBody: string, deps: AccountDeps = {}): Promise<ApiResult> {
  const now = (deps.now ?? (() => new Date()))();

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const { token, password } = (json.body ?? {}) as { token?: unknown; password?: unknown };
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return fail("malformed");
  if (typeof password !== "string") return fail("malformed");
  if (!isValidNewPassword(password)) return fail("invalid-password");

  const result = await redeemResetToken(db, { token, passwordHash: await hashPassword(password), now });
  if (!result.ok) {
    const error = `link-${result.reason}` as const;
    return { status: ERRORS[error].status, body: { error, message: RESET_LINK_MESSAGES[error] } };
  }
  return { status: 200, body: { message: PASSWORD_CHANGED_MESSAGE } };
}
