// Where the login page sends the person after logging in: the `?next=…` page (e.g. "/create"), or the front page.
// Only a plain path on this site is allowed: it starts with one "/", not "//" or "/\" (browsers read both as
// "another site"), and contains only ordinary URL characters. Anything else falls back to "/".
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== "string") return "/";
  return /^\/(?![/\\])[A-Za-z0-9\-._~/?=&%]*$/.test(next) ? next : "/";
}
