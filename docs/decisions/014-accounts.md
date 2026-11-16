# 014 – Accounts

Date: 16 Nov 2026 · Status: started (sign-up built, issue #24; email verification, issue #26; login, sessions and
log out, issue #27; resending the link, issue #28; password reset, issue #29). Email delivery through Brevo is added
here as an update by its issue (#25).

Spec: `specs/004-accounts-landing.md`. Terms (account, username, guest, nickname): `GLOSSARY.md`.

## Decision
- **Accounts only to create a room.** Solo and joining with a room code stay open to guests (reverses part
  of decision 007).
- **Sign-up:** email, username and password. Username 3–20 characters (letters, digits, `_`), unique
  ignoring case, shown as typed. Email looks like an email, at most 254 characters, stored lowercase, one
  account per email. Password 8–128 characters, no other rules.
- **Passwords** are stored only as **scrypt** hashes with a random 16-byte salt per password
  (`scrypt$<salt>$<hash>`), made with Node's built-in `crypto`, no extra package.
- **Email-link tokens** are 32 random bytes; only their SHA-256 hash is stored in `email_tokens`, with a
  purpose (`verify` or `reset`) and an end time. A verification link lasts 24 hours, a reset link 1 hour.
- **New accounts are not verified.** Signing up again with the email of an unverified account replaces it
  (new username, password and link). A valid sign-up always gets the same reply, "Check your inbox to
  finish signing up".
- **Email verification:** the email links to `/verify-email?token=…`. The page reads the token, removes it
  from the address bar and sends it to `POST /api/accounts/verify-email`, which marks the account verified.
  The link works once (`used_at`) and for 24 hours. Replies: verified (200), unknown link (404, also the
  old link of a replaced pending account), already used or expired (410), each with its own message.
- **Never reveal a registered email:** signing up with the email of a **verified** account creates nothing
  and sends that address a "You already have an account. Forgot your password?" email instead of a
  verification email. The page gets the same "Check your inbox" reply as every other valid sign-up.
- **The database decides who wins:** a unique index on `lower(username)` and a unique `email`. Sign-up
  runs one transaction (delete the unverified account with that email, insert with `ON CONFLICT DO
  NOTHING`, then read why nothing was inserted), so of two sign-ups at the same moment exactly one wins.
- **Log in:** one box "Username or email" and a password. A value with `@` is an email, otherwise a username;
  both ignore case. A wrong password, an unknown username and an unknown email all get 401 "Wrong username/email
  or password". With no account, a fixed dummy hash is checked, so the reply takes the same time. The right
  password for an account that is not verified yet gets 403 "Verify your email first".
- **Sessions:** logging in creates a session: 32 random bytes in a cookie called `session` (`HttpOnly`,
  `Secure`, `SameSite=Lax`, `Path=/`, 30 days). Only its SHA-256 hash is stored in `sessions`, with an end
  time; deleting an account deletes its sessions. `GET /api/accounts/me` returns the username, or `null` for a
  missing, unknown or expired session. **Log out** deletes this browser's session and clears the cookie; other
  browsers of the same account stay logged in.
- **Password reset:** `/login` links to "Forgot password?" (`/forgot-password`, also linked from the "already
  have an account" email). `POST /api/accounts/forgot-password` takes an email and always answers "If an account
  exists for that address, we sent an email"; only a known email gets a link to `/reset-password?token=…`. The
  page removes the token from the address bar and sends it with the new password (same 8–128 rule) to
  `POST /api/accounts/reset-password`. One query uses the link (once, within 1 hour), replaces the password hash,
  **ends every session of the account** and marks the email verified. A password that breaks the rule is refused
  before the link is used, so the person can try again. Link replies: changed (200), unknown (404, also a
  verification link), used or expired (410), with messages that point to the forgot-password page.
- **One email per minute:** each account has `last_email_sent_at`. `claimEmailSlot` sets it to now in one
  query, only when it is empty or at least 60 seconds old (`EMAIL_THROTTLE_MS`); otherwise the request gets
  429 "Please wait a minute before asking for another email". **Every** email to an address goes through it:
  sign-up, "you already have an account", "Send the email again" and forgot password. Sign-up never answers 429
  (that would reveal the email): when the slot is taken it gives the normal reply and sends nothing. A pending
  account that is replaced passes its `last_email_sent_at` on to the new one, so signing up again does not
  get around the limit.
- **Send the email again:** after "Verify your email first", the login page offers **"Send the email again"**
  (with an email box when the person logged in with a username). `POST /api/accounts/resend-verification`
  takes an email; an unverified account gets a new 24-hour link, and a verified account or an unknown address
  gets the same reply ("If that address has an account that is not verified yet, we sent it a new link") and
  no email.
- **Emails go through `lib/email/`.** The accounts API receives the email sender as a parameter. Until the
  Brevo issue (#25) is built, every email is printed to the server terminal.

## Why
- Creating a room needs a known owner; everything else should stay fast for the 3-minute demo.
- **scrypt** is slow on purpose and uses memory, so guessing passwords from a leaked hash is expensive.
  The salt makes the same password give different hashes. It is built into Node, so no new package.
- **Hashed tokens:** a leaked copy of the database cannot be used to verify or reset someone else's account
  (same reason as room tokens, decision 012). A plain SHA-256 is enough because tokens are long and random.
- **Replacing unverified accounts:** nobody can block an email address by registering it first; only the
  person who reads that inbox can finish the sign-up.
- **Same reply every time:** the sign-up page never tells a stranger whether an email is registered. The
  "already" email still helps the real owner, who may have forgotten they signed up.
- **Token out of the address bar:** a token left in the URL can end up in the browser history, a shared
  screenshot or a copied link. One query uses the token and verifies the account, so of two clicks at the
  same moment exactly one wins.
- **Same reply for wrong password and unknown account, same time:** otherwise the login form could be used to
  find out which usernames and emails have an account. The dummy hash removes the timing difference (scrypt
  takes long, so skipping it would be easy to measure).
- **Cookie settings:** `HttpOnly` keeps the token away from page JavaScript (and from an injected script),
  `Secure` keeps it off plain HTTP, `SameSite=Lax` stops other sites from sending it with their forms. Hashed
  like every other token, so a leaked database cannot log anyone in.
- **The landing page asks `/me`:** page JavaScript cannot read an `HttpOnly` cookie, and the landing page can
  stay a fast static page.
- **Reset ends every session:** someone who changes a password because it leaked must be able to throw out
  whoever logged in with it. Opening the reset link proves the person reads the inbox, so the email counts
  as verified too. One hour is short, because a reset link can take over the account.
- **One email per minute:** without it, the forgot-password, resend and sign-up forms could flood a stranger's
  inbox and use up the daily email quota. One query takes the slot, so two requests at the same moment cannot
  both send. One limit for all emails, so switching forms does not get around it.
- **Rules in the database:** they hold even if the code has a mistake, and they handle requests at the same moment.

## Alternatives
- **Login with Google/GitHub:** less to build securely, but more setup and an outside dependency (out of scope).
- **bcrypt or argon2:** good as well, but need a package; scrypt is built in.
- **Telling the user "this email is taken":** clearer, but reveals who has an account.
- **A signed token (JWT) instead of a sessions table:** no database read per request, but it cannot be ended
  on the server before it runs out, so log out and "end every session after a password reset" would not really work.

## Limits
- Usernames held by accounts that are never verified stay taken until someone signs up again with that
  email (no clean-up job).
- Sign-up still says "This username is taken" when the username is taken, even if the email also belongs to
  that account; usernames are public, so this reveals nothing about the email.
- Two sign-ups with the same new email at the same moment: the loser gets the normal reply but no email.
- A new verification link does not cancel older ones; each still works once until its 24 hours are up.
- **The limit is per address, not per sender:** it does not stop someone from asking for emails to many
  different addresses, one each per minute. A limit per IP address would need shared storage; not built.
- **No lockout after wrong passwords** and no rate limit on log in (decided on 15 Nov 2026): someone can keep
  guessing a password. scrypt makes each guess slow, and a lockout would let anyone lock a stranger out.
- Sessions are not renewed while in use: after 30 days the person logs in again. Expired sessions stay in the
  table (no clean-up job); they no longer work.
- **The 429 reveals a little:** forgot password answers an unknown email always with 200, but a known email
  asked again within 60 seconds with 429. Someone who asks twice for the same address can tell it has an
  account. Accepted: the spec asks for the "please wait" message, and it costs a minute per guess. "Send the email
  again" works the same way for unverified accounts (the login form already says "Verify your email first" to
  whoever knows the password).
- Asking for a new reset link does not cancel older ones; each still works once until its hour is up.
- Changing the password while logged in (without the email) is not built; use "Forgot password?".
- "Looks like an email" does not prove the address exists; only opening the link does.
- Without Brevo (until #25) emails are only printed, so sign-up works only on a laptop with access to the terminal.

## How it could change
- Brevo delivery (#25) extends `lib/accounts/`, `lib/email/`, `lib/db/accounts.ts` and `lib/api/accounts.ts`.
- A login provider could later be linked to the same `users` table.
