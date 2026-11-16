// The texts of the emails we send, and the links inside them. Plain and short (spec 004).
import type { Email } from "./sender";

// The address of the site, for links in emails. Never taken from the request's Host header, which an
// attacker can fake. APP_URL is set per environment; Vercel sets VERCEL_URL itself (without "https://").
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// A link to one of our pages with a token, e.g. https://…/verify-email?token=…
export function linkWithToken(path: string, token: string, baseUrl: string = appUrl()): string {
  return `${baseUrl}${path}?token=${encodeURIComponent(token)}`;
}

export function verifyEmailMessage(to: string, link: string): Email {
  return {
    to,
    subject: "Confirm your email for the Song Guessing Game",
    text: [
      "Hi,",
      "",
      "please confirm your email address to finish signing up:",
      link,
      "",
      "The link works once and is valid for 24 hours.",
      "If you did not sign up, you can ignore this email.",
    ].join("\n"),
  };
}
