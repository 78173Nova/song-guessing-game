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

// The server sets the session cookie; the page only gets the username.
export function apiLogIn(form: LoginForm, fetchFn: FetchFn = fetch) {
  return post<{ username: string }>("/api/accounts/login", form, fetchFn);
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
