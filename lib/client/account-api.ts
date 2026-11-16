// The browser's calls to the account routes. Like game-api.ts, each call returns the data or a readable
// message – it never throws.
import { post, type FetchFn } from "./game-api";

export type SignupForm = { email: string; username: string; password: string };

// `fetchFn` is only passed in tests; the browser uses the real fetch.
export function apiSignUp(form: SignupForm, fetchFn: FetchFn = fetch) {
  return post<{ message: string }>("/api/accounts/signup", form, fetchFn);
}
