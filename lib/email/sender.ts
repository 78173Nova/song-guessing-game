// How an email leaves the app. The accounts API only knows the EmailSender type, so the tests can pass a fake
// sender and the app can pass the real one. This folder is the only place that sends emails (spec 004).
import { sendWithBrevo } from "./brevo";

export type Email = { to: string; subject: string; text: string };

// A result instead of an exception: a failed email must never crash a request.
export type SendResult = { ok: true } | { ok: false };

export type EmailSender = (email: Email) => Promise<SendResult>;

// Local development without a Brevo key: print the email to the server terminal instead of sending it,
// so teammates can try the whole flow (and click the link) without the key.
export const printEmail: EmailSender = async (email) => {
  console.log(
    ["", "---- Email (not sent: no BREVO_API_KEY) ----", `To: ${email.to}`, `Subject: ${email.subject}`, "", email.text, "----", ""].join(
      "\n",
    ),
  );
  return { ok: true };
};

// A sender that always fails with an error in the server log, for a site that is set up wrong.
function failingSender(problem: string): EmailSender {
  return async () => {
    console.error(`Email not sent: ${problem}`);
    return { ok: false };
  };
}

// The sender the app uses (issue #25): Brevo when BREVO_API_KEY is set. Without a key, local development prints
// each email to the terminal; on Vercel (which sets VERCEL) a missing key is an error, never a silent print.
export function getEmailSender(
  env: Record<string, string | undefined> = process.env,
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>,
): EmailSender {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) {
    return env.VERCEL ? failingSender("BREVO_API_KEY is not set on this deployment.") : printEmail;
  }
  const from = env.EMAIL_FROM;
  if (!from) return failingSender("EMAIL_FROM is not set (the sender address verified in Brevo).");
  return (email) => sendWithBrevo(email, { apiKey, from, fetchFn });
}
