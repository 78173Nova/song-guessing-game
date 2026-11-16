// Where the login page sends the person after logging in: the `?next=…` page (e.g. "/create"), or the front page.
// Only a plain path on this site is allowed: it starts with one "/", not "//" or "/\" (browsers read both as
// "another site"), and contains only ordinary URL characters. Anything else falls back to "/".
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== "string") return "/";
  return /^\/(?![/\\])[A-Za-z0-9\-._~/?=&%]*$/.test(next) ? next : "/";
}

// A guest who has no account yet goes /login?next=/create → Sign up → the verification email (often opened in a
// new tab) → Log in. The address loses `next` on the way, so the login page remembers it in localStorage and
// uses it once, on the next successful login. Storage can be blocked, so every access is guarded.
const STORAGE_KEY = "after-login";

export function rememberNextPath(next: string | null) {
  if (next === null || safeNextPath(next) === "/") return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage the person lands on the front page after signing up.
  }
}

// The page to open after logging in: `?next=` if there is one, otherwise the remembered one. Forgets it.
export function takeNextPath(next: string | null): string {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing remembered
  }
  return safeNextPath(next ?? remembered);
}
