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
  (new username, password and link), unless that address got an email in the last minute: then nothing changes
  and the old account and its link stay valid. A valid sign-up always gets the same reply, "Check your inbox to
  finish signing up".
- **Email verification:** the email links to `/verify-email?token=…`. The page reads the token, removes it
  from the address bar and sends it to `POST /api/accounts/verify-email`, which marks the account verified.
  The link works once (`used_at`) and for 24 hours. Replies: verified (200), unknown link (404, also the
  old link of a replaced pending account), already used or expired (400, error codes `link-used` and
  `link-expired`), each with its own message. An expired link points to logging in and "Send the email again".
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
  verification link), used or expired (400 with `link-used` / `link-expired`), with messages that point to the
  forgot-password page.
- **One email per minute, per address:** the table `email_throttle` keeps, for every address that was asked
  for (with or without an account), the time of its last email, keyed by the SHA-256 hash of the lowercase
  address. `claimEmailSlot` sets it to now in one query, only when there is none yet or it is at least 60
  seconds old (`EMAIL_THROTTLE_MS`); otherwise forgot password and "Send the email again" answer 429 "Please
  wait a minute before asking for another email", for an unknown address the same as for a known one.
  **Every** email goes through it: sign-up, "you already have an account", "Send the email again" and forgot
  password. Sign-up never answers 429 (that would reveal the email): within the minute it changes nothing,
  gives the normal reply and sends nothing.
- **Request bodies are small:** a route refuses a body whose `Content-Length` is too big before reading it, and
  stops reading once the body passes the limit, so a huge body is never held in memory. Both get the normal
  400 "malformed" reply.
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
  both send. One limit for all emails, so switching forms does not get around it. Kept **per address, not per
  account**, so "please wait" looks the same whether or not the address has an account. Only a hash is stored,
  so the table holds no plain address of someone who never signed up.
- **Signing up again within the minute changes nothing:** replacing the account would cancel the link that was
  just sent, and no new link could be sent yet, so the person would be left with no working link.
- **400 instead of 410 for used or expired links:** the spec lists the error statuses the app uses
  (400/401/403/404/409/429/500); the error code still tells the page which case it is.
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
- ~~**The 429 reveals a little:** a known email asked again within 60 seconds got 429, an unknown one always
  200.~~ Fixed (see the update below): the limit is per address, so both get 429.
- **Someone can delay a sign-up:** asking for a reset or a new link for an address every minute keeps its email
  slot taken, so signing up with it changes nothing and sends nothing until a minute passes without a request.
- Two requests for the same address at the same moment: sign-up checks the slot, then takes it after saving the
  account; if another email took it in between, the account is saved but no email is sent ("Send the email
  again" a minute later helps).
- Asking for a new reset link does not cancel older ones; each still works once until its hour is up.
- ~~Changing the password while logged in (without the email) is not built; use "Forgot password?".~~ Built in
  issue #45 (see the update below).
- "Looks like an email" does not prove the address exists; only opening the link does.
- Without Brevo (until #25) emails are only printed, so sign-up works only on a laptop with access to the terminal.

## How it could change
- Brevo delivery (#25) extends `lib/accounts/`, `lib/email/`, `lib/db/accounts.ts` and `lib/api/accounts.ts`.
- A login provider could later be linked to the same `users` table.

Update 16 Nov 2026 (code review of #24–#29): the one-email-per-minute limit moved from `users.last_email_sent_at`
(per account; the column is dropped) to the table `email_throttle` (per address, hashed), so the 429 no longer
reveals whether an address has an account. Signing up again within the minute no longer replaces the pending
account. Used and expired links answer 400 instead of 410. Routes cap the request body while reading it.

Update 16 Nov 2026 (team accounts): `npm run db:team-accounts` creates the accounts listed in `TEAM_ACCOUNTS`
(`email|username|password;…`) already verified, so the team can test multiplayer and demo without the email step
(the course asks for prepared demo accounts). They are ordinary accounts with no extra rights. Their emails,
usernames and passwords exist only in `.env.local` and the host's settings, never in the repository. Running it
again gives an existing account its configured password back, keeps its username and sessions, and marks it
verified; a username taken by another email is reported and left alone.

Update 16 Nov 2026 (review of the team accounts): **passwords may not contain spaces** (no whitespace at all),
at sign-up, password reset and in `TEAM_ACCOUNTS`, so a space typed by mistake at the start or end cannot lock
anyone out. Login does not check this rule, so an older password with a space still works. **An abandoned sign-up
frees its username:** an account that was never verified and has no working link left (its 24-hour link, or a
newer one from "Send the email again") is deleted when someone else signs up with its username, or when a team
account is created with it. Until then, signing up reserves the username. The team accounts script prints the
username that is really stored when an email already had an account with another username; log in with the
email in that case.

Update 17 Nov 2026 (avatars and Account settings, issue #44): every player has an **avatar** from a fixed set of
16 emoji (`lib/game/avatars.ts`; the server stores and sends an id such as `fox`, no uploads, no package). An
account keeps an avatar and a **usual nickname** (`users.avatar`, `users.usual_nickname`, both empty until chosen);
`GET/POST /api/accounts/settings` reads and changes them, only for the account of the session cookie (401 otherwise),
with the same nickname rule as in rooms ("" or null removes the usual nickname) and only ids of the set as avatar.
The page **Account settings** (`/account`) is linked from "Logged in as <username>". Creating or joining a room takes
`{ nickname, avatar? }`; an unknown avatar is refused (400 `invalid-avatar`). The first room of an account without
an avatar saves the picked one (once; later picks on the nickname screen apply to that room only). With no avatar in
the request the account's saved one is used, else the music note. Joining reads the session cookie only for this;
guests join as before. The room state adds `avatars` (avatar id by nickname). Why emoji: they need no image files,
look the same size everywhere and a screen reader can skip them (the nickname says who it is). Limit: the database
checks only the form of an avatar id (lower-case letters); the exact list is checked in the code.

Update 17 Nov 2026 (changing username, email and password, issue #45): the Account settings page also changes the
login details, each only for the account of the session cookie (401 otherwise):
- **Username** (`POST /api/accounts/username`, `{ username }`): same rule as at sign-up, unique ignoring case (409
  "This username is taken", also for a sign-up that is not verified yet; an abandoned sign-up frees it as at sign-up).
  The account's own username in another case is allowed. The old username is free straight away.
- **Email** (`POST /api/accounts/email`, `{ email, password }`): needs the **current password** (403
  `wrong-password`). The new address gets a link to `/confirm-email?token=…` (purpose `email` in `email_tokens`, which
  now keeps the new address in `new_email`; 24 hours, works once). The **old** address gets "Your email is being
  changed to …. If this wasn't you, reset your password." with the forgot-password link. The email changes only when
  the link is opened (`POST /api/accounts/confirm-email`, replies like the verify link: 404 unknown, 400 `link-used` /
  `link-expired`). Both emails go through the one-email-per-minute limit **together** (`claimEmailSlots`): if either
  address got an email in the last minute, 429 and nothing is sent. **Never reveals an account:** when the new address
  already belongs to a verified account, the reply is the same, no link is made, and that address gets a short "you
  already have an account with this address, nothing was changed" email instead. Opening the link deletes an
  unverified sign-up with the new address (like signing up again). The own email gives 400 `same-email`.
- **Password** (`POST /api/accounts/password`, `{ currentPassword, newPassword }`): needs the current password (403
  `wrong-password`), same rule as at sign-up (8–128 characters, no spaces), and in one query replaces the hash and
  **ends every other session**; this browser stays logged in.
Why: the current password stops someone at an unlocked computer from taking over the account; the email changes only
after the link, so a typo cannot lock anyone out; the notice tells the real owner in time. Why 403 and not 401 for a
wrong current password: 401 means "log in first", and the person is logged in.
Limits: if a verified account takes the new address between the request and the click, the link answers 409
`email-taken` (only the reader of that inbox sees it) and stays unused. Changing the password or email does not cancel
links that were already sent (reset, email change); each still works once until it runs out. No limit on guessing the
current password (same as log in). Deleting an account is still not built.
