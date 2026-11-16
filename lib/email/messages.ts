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

// Sent instead of a verification email when someone signs up with the email of a verified account.
export function alreadyHaveAccountMessage(to: string, forgotPasswordLink: string): Email {
  return {
    to,
    subject: "You already have an account",
    text: [
      "Hi,",
      "",
      "someone (probably you) tried to sign up for the Song Guessing Game with this email address,",
      "but you already have an account. You can log in with your username or email.",
      "",
      "Forgot your password? Choose a new one here:",
      forgotPasswordLink,
      "",
      "If this was not you, you can ignore this email. Nothing was changed.",
    ].join("\n"),
  };
}
