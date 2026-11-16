# 014 – Accounts

Date: 16 Nov 2026 · Status: started (sign-up built, issue #24; email verification, issue #26; login, sessions and
log out, issue #27). Email delivery through Brevo, resending the link and password reset are added here as updates
by their issues (#25, #28, #29).

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
  purpose (`verify` now, `reset` later) and an end time. A verification link lasts 24 hours.
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
- An expired link can only be replaced by signing up again until "Send the email again" (#28) exists.
- **No lockout after wrong passwords** and no rate limit on log in (decided on 15 Nov 2026): someone can keep
  guessing a password. scrypt makes each guess slow, and a lockout would let anyone lock a stranger out.
- Sessions are not renewed while in use: after 30 days the person logs in again. Expired sessions stay in the
  table (no clean-up job); they no longer work.
- "Looks like an email" does not prove the address exists; only opening the link does.
- Without Brevo (until #25) emails are only printed, so sign-up works only on a laptop with access to the terminal.

## How it could change
- Brevo delivery (#25), resend (#28) and password reset (#29)
  extend `lib/accounts/`, `lib/email/`, `lib/db/accounts.ts` and `lib/api/accounts.ts`.
- A login provider could later be linked to the same `users` table.
