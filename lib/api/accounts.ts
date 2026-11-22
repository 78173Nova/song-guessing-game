// What each account route does, step by step: validate the input, apply the rules from lib/accounts, save,
// send the email, and build the reply. The route files in app/api/accounts/ only call these functions.
// The database, the clock, the email sender and the token maker are passed in, so the tests can use PGlite,
// a fake clock, a fake sender and predictable tokens.
import {
  checkPassword,
  createToken,
  hashPassword,
  looksLikeToken,
  parseEmailChangeInput,
  parseEmailInput,
  parseLoginInput,
  parsePasswordChangeInput,
  parseResetPasswordInput,
  parseSignupInput,
  parseTokenInput,
  parseUsernameInput,
  RESET_LINK_LIFETIME_MS,
  SESSION_LIFETIME_MS,
  VERIFY_LINK_LIFETIME_MS,
} from "../accounts/rules";
import type { TransactionDb } from "../db/client";
import {
  claimEmailSlot,
  claimEmailSlots,
  confirmEmailChangeToken,
  createEmailChangeToken,
  createEmailToken,
  createPendingAccount,
  createSession,
  deleteSession,
  findAccountForLogin,
  findSessionLogin,
  findSessionUsername,
  findUnverifiedUserId,
  redeemEmailToken,
  renameAccount,
  replacePassword,
  saveAccountSettings as storeAccountSettings,
} from "../db/accounts";
import { isAvatar, type AvatarId } from "../game/avatars";
import { parseNickname } from "../game/rooms";
import {
  alreadyHaveAccountMessage,
  appUrl,
  confirmEmailChangeMessage,
  emailChangeNoticeMessage,
  emailChangeTakenMessage,
  linkWithToken,
  resetPasswordMessage,
  verifyEmailMessage,
} from "../email/messages";
import { getEmailSender, type EmailSender } from "../email/sender";
import { errorSummary, findBySession, isJsonObject, PLAYER_INPUT_ERRORS, sessionAccount } from "./shared";

// setCookie is the value of a Set-Cookie header for the route to send (log in, log out). It is the only place a
// session token leaves the server; the body never contains one.
export type ApiResult = { status: number; body: Record<string, unknown>; setCookie?: string };

export type AccountDeps = {
  now?: () => Date;
  sendEmail?: EmailSender;
  makeToken?: () => string;
};

// The real clock, sender and token maker, unless a test passes its own. The time is read once per request.
function resolveDeps(deps: AccountDeps): { now: Date; sendEmail: EmailSender; makeToken: () => string } {
  return {
    now: deps.now ? deps.now() : new Date(),
    sendEmail: deps.sendEmail ?? getEmailSender(),
    makeToken: deps.makeToken ?? createToken,
  };
}

// Sign-up bodies are small (email up to 254, password up to 128 characters). Anything bigger is refused
// before parsing.
const MAX_BODY_LENGTH = 2000;

const CHECK_INBOX_MESSAGE = "Check your inbox to finish signing up";

// A link that was already used or has expired gets 400 (the spec's list of errors has no 410), with its own
// error code and message, so the page can tell the person what to do next.
const ERRORS = {
  malformed: { status: 400, message: "The request is not valid." },
  "invalid-email": { status: 400, message: "Please enter a valid email address." },
  "invalid-username": {
    status: 400,
    message: "Usernames are 3–20 characters long and use only letters, digits and _.",
  },
  "invalid-password": { status: 400, message: "Passwords are 8–128 characters long, without spaces." },
  "username-taken": { status: 409, message: "This username is taken" },
  "wrong-login": { status: 401, message: "Wrong username/email or password" },
  "not-verified": { status: 403, message: "Verify your email first" },
  "link-unknown": { status: 404, message: "This link is not valid. Please use the newest link we sent you." },
  "link-used": { status: 400, message: "This link was already used. If your email is verified, you can log in." },
  "link-expired": {
    status: 400,
    message: 'This link has expired. Please log in and choose "Send the email again" to get a new one.',
  },
  "log-in-needed": { status: 401, message: "Please log in first." },
  "wrong-password": { status: 403, message: "Your current password is not right." },
  "same-email": { status: 400, message: "That is already your email." },
  "email-taken": {
    status: 409,
    message: "This address already has an account, so your email was not changed.",
  },
  ...PLAYER_INPUT_ERRORS,
  "too-soon": { status: 429, message: "Please wait a minute before asking for another email" },
  // The email service (Brevo) gave an error or did not answer in time (issue #25).
  "email-failed": { status: 503, message: "We couldn't send the email right now. Please try again in a minute." },
  "server-error": { status: 500, message: "Something went wrong on the server. Please try again." },
} as const;

type ErrorCode = keyof typeof ERRORS;

// An error reply. A page may give its own message for the same error (the reset page's link messages).
function fail(error: ErrorCode, message: string = ERRORS[error].message): ApiResult {
  return { status: ERRORS[error].status, body: { error, message } };
}

// The most bytes a body of MAX_BODY_LENGTH characters can take: in UTF-8 one JavaScript character takes at most
// 3 bytes (an emoji takes 4 bytes but counts as 2 characters).
const MAX_BODY_BYTES = 3 * MAX_BODY_LENGTH;

// Reads the body of a request as text, but never more than MAX_BODY_BYTES: a body that says it is bigger
// (Content-Length) is refused before reading, and reading stops as soon as the body gets too big, so a huge
// body is never held in memory. Returns null for a refused body; the action then replies 400 "malformed".
export async function readRequestBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Reads a small JSON body; not ok if it is missing, too long or not JSON.
function readJson(rawBody: string | null): { ok: true; body: unknown } | { ok: false } {
  if (rawBody === null || rawBody.length > MAX_BODY_LENGTH) return { ok: false };
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
    console.error("Accounts API error:", errorSummary(error));
    return fail("server-error");
  }
}

// POST /api/accounts/signup – creates an account that is not verified yet and sends the verification link.
// A valid sign-up always gets the same reply, so the page never reveals whether an email is registered.
export async function signUp(db: TransactionDb, rawBody: string | null, deps: AccountDeps = {}): Promise<ApiResult> {
  const { now, sendEmail, makeToken } = resolveDeps(deps);

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

  // Sign-up never answers "please wait" (that would reveal the email). An address that got an email in the last
  // minute changes nothing and gets the normal reply, so a pending account keeps its link.
  if (!created.ok) {
    if (created.reason === "username_taken") return fail("username-taken");
    // The email belongs to a verified account: nothing is created, the owner of that inbox is told, and the
    // reply stays the same, so the page never reveals that the email is registered.
    // Like every email, it is sent only if that address got none in the last minute.
    if (created.reason === "email_verified" && (await claimEmailSlot(db, email, now))) {
      const sent = await sendEmail(alreadyHaveAccountMessage(email, `${appUrl()}/forgot-password`));
      if (!sent.ok) return fail("email-failed");
    }
    return { status: 200, body: { message: CHECK_INBOX_MESSAGE } };
  }

  // When the email service fails, the account stays (not verified); "Send the email again" works a minute later.
  if (await claimEmailSlot(db, email, now)) {
    const sent = await sendEmail(verifyEmailMessage(email, linkWithToken("/verify-email", verifyToken)));
    if (!sent.ok) return fail("email-failed");
  }
  return { status: 200, body: { message: CHECK_INBOX_MESSAGE } };
}

const RESENT_MESSAGE = "If that address has an account that is not verified yet, we sent it a new link";

// POST /api/accounts/resend-verification – { email } → a new verification link for an account that is not
// verified yet. A verified account and an unknown address get the same reply and no email, and the same
// "please wait" when asked again within a minute, so the reply never reveals whether an account exists.
export async function resendVerification(
  db: TransactionDb,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now, sendEmail, makeToken } = resolveDeps(deps);

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const parsed = parseEmailInput(json.body);
  if (!parsed.ok) return fail(parsed.error);
  const { email } = parsed;

  if (!(await claimEmailSlot(db, email, now))) return fail("too-soon");
  const userId = await findUnverifiedUserId(db, email);
  if (userId) {
    const verifyToken = makeToken();
    await createEmailToken(db, {
      userId,
      token: verifyToken,
      purpose: "verify",
      expiresAt: new Date(now.getTime() + VERIFY_LINK_LIFETIME_MS),
    });
    const sent = await sendEmail(verifyEmailMessage(email, linkWithToken("/verify-email", verifyToken)));
    if (!sent.ok) return fail("email-failed");
  }
  return { status: 200, body: { message: RESENT_MESSAGE } };
}

const VERIFIED_MESSAGE = "Your email is verified – you can log in now";

// POST /api/accounts/verify-email – opens the link from the verification email: { token } → verified.
export async function verifyEmail(
  db: TransactionDb,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now } = resolveDeps(deps);

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const parsed = parseTokenInput(json.body);
  if (!parsed.ok) return fail("malformed");

  const result = await redeemEmailToken(db, { purpose: "verify", token: parsed.token, now });
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
export async function logIn(db: TransactionDb, rawBody: string | null, deps: AccountDeps = {}): Promise<ApiResult> {
  const { now, makeToken } = resolveDeps(deps);

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
  const { now } = resolveDeps(deps);
  const username = await findBySession(sessionToken, (token) => findSessionUsername(db, token, now));
  return { status: 200, body: { username } };
}

// POST /api/accounts/logout – ends this browser's session on the server and clears the cookie. Always works,
// even without a session, so the browser always ends up logged out.
export async function logOut(db: TransactionDb, sessionToken: string | undefined): Promise<ApiResult> {
  if (looksLikeToken(sessionToken)) await deleteSession(db, sessionToken);
  return { status: 200, body: { username: null }, setCookie: sessionCookie("", 0) };
}

const IF_EXISTS_MESSAGE = "If an account exists for that address, we sent an email";

// POST /api/accounts/forgot-password – { email } → sends a reset link if an account has that email.
// A known and an unknown email get the same reply, and the same "please wait" when asked again within a
// minute, so the page never reveals whether an email is registered (spec 004, issue #29).
export async function forgotPassword(
  db: TransactionDb,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now, sendEmail, makeToken } = resolveDeps(deps);

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const parsed = parseEmailInput(json.body);
  if (!parsed.ok) return fail(parsed.error);
  const { email } = parsed;

  if (!(await claimEmailSlot(db, email, now))) return fail("too-soon");
  const account = await findAccountForLogin(db, "email", email);
  if (account) {
    const resetToken = makeToken();
    await createEmailToken(db, {
      userId: account.id,
      token: resetToken,
      purpose: "reset",
      expiresAt: new Date(now.getTime() + RESET_LINK_LIFETIME_MS),
    });
    const sent = await sendEmail(resetPasswordMessage(email, linkWithToken("/reset-password", resetToken)));
    if (!sent.ok) return fail("email-failed");
  }
  return { status: 200, body: { message: IF_EXISTS_MESSAGE } };
}

const PASSWORD_CHANGED_MESSAGE = "Your password is changed – you can log in now";

// The reset page's own messages for links that do not work (the verify messages talk about verifying).
const RESET_LINK_MESSAGES = {
  "link-unknown": "This link is not valid. Please use the newest link we sent you.",
  "link-used": "This link was already used. Ask for a new one on the Forgot password page if you need it.",
  "link-expired": "This link has expired. Please ask for a new one on the Forgot password page.",
} as const;

// POST /api/accounts/reset-password – { token, password } → replaces the password, ends every session of the
// account and marks its email verified. A password that breaks the rule (8–128 characters, no spaces) is refused before the link is
// used, so the person can try again with the same link.
export async function resetPassword(
  db: TransactionDb,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now } = resolveDeps(deps);

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const parsed = parseResetPasswordInput(json.body);
  if (!parsed.ok) return fail(parsed.error);

  const result = await redeemEmailToken(db, {
    purpose: "reset",
    token: parsed.token,
    passwordHash: await hashPassword(parsed.password),
    now,
  });
  if (!result.ok) {
    const error = `link-${result.reason}` as const;
    return fail(error, RESET_LINK_MESSAGES[error]);
  }
  return { status: 200, body: { message: PASSWORD_CHANGED_MESSAGE } };
}

// The account settings as the page sees them (issue #44). The account id never leaves the server.
function settingsReply(account: { username: string; avatar: AvatarId | null; nickname: string | null }): ApiResult {
  return { status: 200, body: { username: account.username, avatar: account.avatar, nickname: account.nickname } };
}

// GET /api/accounts/settings – the logged-in account's avatar and usual nickname (null until chosen), for the
// Account settings page and the nickname screen of a room. Without a working session: 401.
export async function getAccountSettings(
  db: TransactionDb,
  sessionToken: string | undefined,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now } = resolveDeps(deps);
  const account = await sessionAccount(db, sessionToken, now);
  return account === null ? fail("log-in-needed") : settingsReply(account);
}

// POST /api/accounts/settings – { avatar, nickname } → saves the logged-in account's avatar (one of the fixed set)
// and usual nickname (same rules as a nickname in a room; "" or null removes it). Only ever changes the account
// of the session cookie. Nothing is saved when one value is refused.
export async function saveAccountSettings(
  db: TransactionDb,
  sessionToken: string | undefined,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now } = resolveDeps(deps);
  const account = await sessionAccount(db, sessionToken, now);
  if (account === null) return fail("log-in-needed");

  const body = readJsonObject(rawBody);
  if (body === null) return fail("malformed");
  if (!isAvatar(body.avatar)) return fail("invalid-avatar");
  const nickname = body.nickname === null || body.nickname === "" ? null : parseNickname(body.nickname);
  if (nickname === null && body.nickname !== null && body.nickname !== "") return fail("invalid-nickname");

  await storeAccountSettings(db, account.id, { avatar: body.avatar, nickname });
  return settingsReply({ username: account.username, avatar: body.avatar, nickname });
}

// The login details of the account of a session cookie (issue #45), or null for a missing, unknown or expired
// session.
function sessionLogin(db: TransactionDb, sessionToken: string | undefined, now: Date) {
  return findBySession(sessionToken, (token) => findSessionLogin(db, token, now));
}

// Reads a small JSON object; null when it is missing, too long, not JSON or not an object.
function readJsonObject(rawBody: string | null): Record<string, unknown> | null {
  const json = readJson(rawBody);
  return json.ok && isJsonObject(json.body) ? json.body : null;
}

// POST /api/accounts/username – { username } → gives the logged-in account a new username, same rules as at
// sign-up (3–20 letters, digits or _, unique ignoring case). The old username is free straight away.
export async function changeUsername(
  db: TransactionDb,
  sessionToken: string | undefined,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now } = resolveDeps(deps);
  const account = await sessionLogin(db, sessionToken, now);
  if (account === null) return fail("log-in-needed");

  const body = readJsonObject(rawBody);
  if (body === null) return fail("malformed");
  const parsed = parseUsernameInput(body);
  if (!parsed.ok) return fail(parsed.error);

  const renamed = await renameAccount(db, { userId: account.id, email: account.email, username: parsed.username, now });
  if (!renamed.ok) return fail("username-taken");
  return { status: 200, body: { username: parsed.username } };
}

const PASSWORD_CHANGED_HERE_MESSAGE = "Your password is changed. Other browsers are logged out; this one stays logged in.";

// POST /api/accounts/password – { currentPassword, newPassword } → replaces the logged-in account's password. Needs
// the current password; the new one follows the sign-up rule (8–128 characters, no spaces). Ends every other
// session of the account; this browser stays logged in.
export async function changePassword(
  db: TransactionDb,
  sessionToken: string | undefined,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now } = resolveDeps(deps);
  const account = await sessionLogin(db, sessionToken, now);
  if (account === null || sessionToken === undefined) return fail("log-in-needed");

  const parsed = parsePasswordChangeInput(readJsonObject(rawBody));
  if (!parsed.ok) return fail(parsed.error);
  if (!(await checkPassword(parsed.currentPassword, account.passwordHash))) return fail("wrong-password");

  await replacePassword(db, {
    userId: account.id,
    passwordHash: await hashPassword(parsed.newPassword),
    keepSession: sessionToken,
  });
  return { status: 200, body: { message: PASSWORD_CHANGED_HERE_MESSAGE } };
}

const EMAIL_CHANGE_SENT_MESSAGE =
  "Check the inbox of your new address: your email changes when you open the link we sent there.";

// POST /api/accounts/email – { email, password } → starts moving the logged-in account to a new email. Needs the
// current password. The new address gets a 24-hour link (the email changes only when it is opened), the old one a
// notice. Both emails go through the one-email-per-minute limit together. When the new address already has a
// verified account, it gets a short "you already have an account" email instead of the link, and the reply is the
// same, so the reply never reveals whether an address has an account.
export async function changeEmail(
  db: TransactionDb,
  sessionToken: string | undefined,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now, sendEmail, makeToken } = resolveDeps(deps);
  const account = await sessionLogin(db, sessionToken, now);
  if (account === null) return fail("log-in-needed");

  const parsed = parseEmailChangeInput(readJsonObject(rawBody));
  if (!parsed.ok) return fail(parsed.error);
  const { email: newEmail, password } = parsed;
  if (!(await checkPassword(password, account.passwordHash))) return fail("wrong-password");
  if (newEmail === account.email) return fail("same-email");

  if (!(await claimEmailSlots(db, [account.email, newEmail], now))) return fail("too-soon");
  const owner = await findAccountForLogin(db, "email", newEmail);
  let sent;
  if (owner?.verified) {
    sent = await sendEmail(emailChangeTakenMessage(newEmail));
  } else {
    const token = makeToken();
    await createEmailChangeToken(db, {
      userId: account.id,
      token,
      newEmail,
      expiresAt: new Date(now.getTime() + VERIFY_LINK_LIFETIME_MS),
    });
    sent = await sendEmail(confirmEmailChangeMessage(newEmail, linkWithToken("/confirm-email", token)));
  }
  // The notice to the old address is only sent once the email to the new address has gone out.
  if (!sent.ok) return fail("email-failed");
  const notice = await sendEmail(emailChangeNoticeMessage(account.email, newEmail, `${appUrl()}/forgot-password`));
  if (!notice.ok) return fail("email-failed");
  return { status: 200, body: { message: EMAIL_CHANGE_SENT_MESSAGE } };
}

const EMAIL_CHANGED_MESSAGE = "Your email is changed – log in with the new address from now on.";

// The confirm page's own messages for links that do not work.
const EMAIL_LINK_MESSAGES = {
  "link-unknown": "This link is not valid. Please use the newest link we sent you.",
  "link-used": "This link was already used. If your email was changed, log in with the new address.",
  "link-expired": "This link has expired. Please change your email again on the Account settings page.",
} as const;

// POST /api/accounts/confirm-email – opens the link sent to the new address: { token } → the account's email
// becomes the new address. Works once and for 24 hours. If a verified account got that address in the meantime,
// nothing changes (409 email-taken); only the person who reads that inbox sees this.
export async function confirmEmailChange(
  db: TransactionDb,
  rawBody: string | null,
  deps: AccountDeps = {},
): Promise<ApiResult> {
  const { now } = resolveDeps(deps);

  const json = readJson(rawBody);
  if (!json.ok) return fail("malformed");
  const parsed = parseTokenInput(json.body);
  if (!parsed.ok) return fail("malformed");

  const result = await confirmEmailChangeToken(db, { token: parsed.token, now });
  if (!result.ok) {
    if (result.reason === "taken") return fail("email-taken");
    const error = `link-${result.reason}` as const;
    return fail(error, EMAIL_LINK_MESSAGES[error]);
  }
  return { status: 200, body: { message: EMAIL_CHANGED_MESSAGE } };
}
