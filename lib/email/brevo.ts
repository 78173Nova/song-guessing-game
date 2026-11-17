// Sends one email through Brevo's transactional email API (issue #25, decision 014). The only place in the app
// that talks to Brevo. A plain fetch, no package. It never throws: every problem comes back as { ok: false }.
import type { Email, SendResult } from "./sender";

export const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_TIMEOUT_MS = 5000;
const SENDER_NAME = "Song Guessing Game";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type BrevoSettings = {
  apiKey: string;
  from: string; // the sender address verified in Brevo
  fromName?: string; // the name shown as the sender; "Song Guessing Game" when not given
  fetchFn?: FetchFn; // tests pass a fake; the app uses the real fetch
  timeoutMs?: number;
};

export async function sendWithBrevo(email: Email, settings: BrevoSettings): Promise<SendResult> {
  const fetchFn = settings.fetchFn ?? fetch;
  try {
    // The signal cancels the request when the time is up.
    const response = await fetchFn(BREVO_URL, {
      method: "POST",
      headers: { "api-key": settings.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: settings.from, name: settings.fromName ?? SENDER_NAME },
        to: [{ email: email.to }],
        subject: email.subject,
        textContent: email.text,
      }),
      signal: AbortSignal.timeout(settings.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Only the status goes to the log: never the key, and not the address or the link in the email.
      console.error(`Brevo refused an email (status ${response.status}).`);
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error("Brevo could not be reached:", error instanceof Error ? error.name : "unknown error");
    return { ok: false };
  }
}
