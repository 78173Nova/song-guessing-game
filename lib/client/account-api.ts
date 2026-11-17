// The browser's calls to the account routes. Like game-api.ts, each call returns the data or a readable
// message – it never throws.
import { post, type FetchFn } from "./game-api";

export type SignupForm = { email: string; username: string; password: string };

// `fetchFn` is only passed in tests; the browser uses the real fetch.
export function apiSignUp(form: SignupForm, fetchFn: FetchFn = fetch) {
  return post<{ message: string }>("/api/accounts/signup", form, fetchFn);
}

export function apiVerifyEmail(token: string, fetchFn: FetchFn = fetch) {
  return post<{ message: string }>("/api/accounts/verify-email", { token }, fetchFn);
}

export type LoginForm = { login: string; password: string };

// The server sets the session cookie; the page only gets the username. notVerified is true for the 403 "Verify
// your email first", so the page can offer "Send the email again".
export async function apiLogIn(form: LoginForm, fetchFn: FetchFn = fetch) {
  let status = 0;
  const result = await post<{ username: string }>("/api/accounts/login", form, async (url, init) => {
    const response = await fetchFn(url, init);
    status = response.status;
    return response;
  });
  return result.ok ? result : { ...result, notVerified: status === 403 };
}

export function apiResendVerification(email: string, fetchFn: FetchFn = fetch) {
  return post<{ message: string }>("/api/accounts/resend-verification", { email }, fetchFn);
}

export function apiLogOut(fetchFn: FetchFn = fetch) {
  return post<{ username: null }>("/api/accounts/logout", undefined, fetchFn);
}

// Who is logged in: the username, or null when nobody is (or the server cannot be reached).
export async function apiWhoIsLoggedIn(fetchFn: FetchFn = fetch): Promise<string | null> {
  try {
    const response = await fetchFn("/api/accounts/me", { cache: "no-store" });
    const data = (await response.json()) as { username?: unknown };
    return typeof data.username === "string" ? data.username : null;
  } catch {
    return null;
  }
}

export function apiForgotPassword(email: string, fetchFn: FetchFn = fetch) {
  return post<{ message: string }>("/api/accounts/forgot-password", { email }, fetchFn);
}

export function apiResetPassword(token: string, password: string, fetchFn: FetchFn = fetch) {
  return post<{ message: string }>("/api/accounts/reset-password", { token, password }, fetchFn);
}

// The saved avatar and usual nickname of the logged-in account (issue #44); null until chosen.
export type AccountSettings = { username: string; avatar: string | null; nickname: string | null };

// The logged-in account's settings, or null for a guest (401), a server error or no connection – the nickname
// screen then treats the person as a guest.
export async function apiAccountSettings(fetchFn: FetchFn = fetch): Promise<AccountSettings | null> {
  try {
    const response = await fetchFn("/api/accounts/settings", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<AccountSettings>;
    return typeof data.username === "string"
      ? { username: data.username, avatar: data.avatar ?? null, nickname: data.nickname ?? null }
      : null;
  } catch {
    return null;
  }
}

// Saves the avatar and usual nickname ("" removes the usual nickname). The server checks both again.
export function apiSaveAccountSettings(form: { avatar: string; nickname: string }, fetchFn: FetchFn = fetch) {
  return post<AccountSettings>("/api/accounts/settings", form, fetchFn);
}
