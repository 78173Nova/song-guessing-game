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

// Sent when someone asks for a new password on the forgot-password page.
export function resetPasswordMessage(to: string, link: string): Email {
  return {
    to,
    subject: "Reset your password for the Song Guessing Game",
    text: [
      "Hi,",
      "",
      "someone (probably you) asked to reset the password of your account. Choose a new one here:",
      link,
      "",
      "The link works once and is valid for 1 hour. Setting a new password logs you out everywhere.",
      "If you did not ask for this, you can ignore this email. Nothing was changed.",
    ].join("\n"),
  };
}

// Sent to the new address when an account holder changes their email (issue #45).
export function confirmEmailChangeMessage(to: string, link: string): Email {
  return {
    to,
    subject: "Confirm your new email for the Song Guessing Game",
    text: [
      "Hi,",
      "",
      "someone (probably you) wants to use this address for their Song Guessing Game account. Confirm it here:",
      link,
      "",
      "The link works once and is valid for 24 hours. The email of the account changes only when you open it.",
      "If you did not ask for this, you can ignore this email. Nothing was changed.",
    ].join("\n"),
  };
}

// Sent instead of the link when the new address already has an account, so the reply never tells the person who
// asked whether it has one (issue #45).
export function emailChangeTakenMessage(to: string): Email {
  return {
    to,
    subject: "Someone tried to use your email address",
    text: [
      "Hi,",
      "",
      "someone asked to move a Song Guessing Game account to this email address, but you already have an",
      "account with it. Nothing was changed.",
      "",
      "If this was not you, you can ignore this email.",
    ].join("\n"),
  };
}

// Sent to the old address when an account holder asks to change their email (issue #45).
export function emailChangeNoticeMessage(to: string, newEmail: string, forgotPasswordLink: string): Email {
  return {
    to,
    subject: "Your email is being changed",
    text: [
      "Hi,",
      "",
      `Your email is being changed to ${newEmail}. It changes once the link we sent to that address is opened.`,
      "",
      "If this wasn't you, reset your password:",
      forgotPasswordLink,
    ].join("\n"),
  };
}
