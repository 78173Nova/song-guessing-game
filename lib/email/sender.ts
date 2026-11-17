// How an email leaves the app. The accounts API only knows the EmailSender type, so the tests can pass a fake
// sender and the app can pass the real one. This folder is the only place that sends emails (spec 004).

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

// The sender the app uses. For now it always prints; real delivery through Brevo comes with issue #25.
export function getEmailSender(): EmailSender {
  return printEmail;
}
