# Spec 004 – Landing page and accounts

Owner: Jasper (Person 4) · Branch: `feature/accounts`, then `feature/landing-page` (see "Suggested order") ·
Status: draft (decided with Claude on 15 Nov 2026, not yet read by the team)

## Why
Today the site opens straight into the solo game. Nothing explains what the app is, and there is no way in for
multiplayer. The landing page is the first thing a grader and the demo audience see ("UI/UX"), so it should say
in one look what the game does and offer every way in: play solo, join a room with a code, or log in.

Accounts exist for one reason: **creating a room needs an account**, so a room always has a known owner. Everything
else stays open: solo needs no account, and anyone with a room code can join as a guest. This keeps the
3-minute demo fast (the audience never signs up) and still gives the security criterion a real login to look at.
This reverses decision 007 ("no accounts") for room creation only.

Terms used below (**Account, Username, Guest, Nickname, Room code**) are defined in `GLOSSARY.md`.
When a line below can be read two ways, choose the simpler option that keeps the server in control.

## What

### Landing page (`/`)
- [ ] One card: the game's name, a one-line pitch, and 3 short points about what the game does
      (hear a clip, guess fast, play alone or with friends in a room)
- [ ] **Log in** and **Sign up** buttons. When logged in, these become "Logged in as **<username>**" and **Log out**
- [ ] Below them: a **room code** box and an **Enter** button. Enter checks that the code is exactly 6 digits
      (otherwise "Room codes are 6 digits") and goes to `/join/<code>`
- [ ] A **Play solo** link. The solo game moves from `/` to `/solo`, unchanged, and needs no account
- [ ] `/join/<code>` shows "Rooms are coming soon" until the room pages (spec 002) are built
- [ ] Usable on a phone-sized screen; the iTunes credit stays on `/solo`

### Sign up (`/signup`)
- [ ] Fields: email, username, password
- [ ] **Username:** 3–20 characters, only letters, digits and `_`. Unique **ignoring case** ("Jasper" = "jasper");
      shown with the case it was typed in. It never contains `@`, so login can tell a username from an email
- [ ] **Email:** must look like an email (one `@`, a dot after it, no spaces, at most 254 characters), stored lowercase,
      one account per email
- [ ] **Password:** 8–128 characters, no other rules
- [ ] Username taken → "This username is taken" (usernames are public, so saying so is fine)
- [ ] After a valid sign-up the page always says **"Check your inbox to finish signing up"**:
  - new email → the account is created (not yet verified) and a verification email is sent
  - email already has a **verified** account → nothing is created; that address gets a "You already have an account.
    Forgot your password?" email instead. The page does not reveal this
  - email already has an **unverified** account → that pending account is replaced (new username and password)
    and a new verification email is sent. Only whoever reads that inbox can finish it

### Email verification
- [ ] The verification email contains a link to `/verify-email?token=…`. The page sends the token to the server,
      which marks the account verified. The link is valid **24 hours** and works **once**
- [ ] Clear messages for: verified ("Your email is verified – you can log in now"), link expired, link already used or unknown
- [ ] An account can **not log in** until it is verified

### Log in (`/login`)
- [ ] One box "Username or email" and a password box. A value with `@` is treated as an email, otherwise as a username
      (ignoring case for both)
- [ ] Wrong username, wrong email or wrong password all give the same message: **"Wrong username/email or password"**.
      The server takes the same time whether or not the account exists (it checks a dummy hash when there is no account)
- [ ] Right password but not verified → "Verify your email first" and a **"Send the email again"** button
- [ ] On success: a session starts and the browser goes back to `/`
- [ ] **No lockout** after wrong passwords (decided, written down as a limit in decision 014)

### Forgot password (`/forgot-password`, `/reset-password`)
- [ ] `/login` links to "Forgot password?". The form takes an email and always answers
      **"If an account exists for that address, we sent an email"**
- [ ] The email links to `/reset-password?token=…`, valid **1 hour**, works **once**
- [ ] Setting a new password (same 8–128 rule): replaces the hash, **ends every session of that account**, and also
      marks the email verified (clicking the link proves the person reads that inbox)
- [ ] Clear messages for: password changed ("You can log in now"), link expired, link already used or unknown

### Sessions and log out
- [ ] Logging in creates a **session**: a long random token in a cookie that page JavaScript cannot read
      (`httpOnly`, `Secure`, `SameSite=Lax`, whole site). It lasts **30 days**
- [ ] **Log out** deletes the session on the server and clears the cookie
- [ ] The landing page asks the server who is logged in (`GET /api/accounts/me`); an expired or unknown session = logged out

### Emails (Brevo)
- [ ] All emails go through `lib/email/` – the only place that talks to Brevo – with a plain `fetch`
      (`POST https://api.brevo.com/v3/smtp/email`), a **5-second timeout**, and a result instead of an exception
- [ ] Three emails, plain and short: verify your email · reset your password · you already have an account
- [ ] Links in emails are built from `APP_URL` (set per environment), falling back to Vercel's own `VERCEL_URL`,
      then `http://localhost:3000` – never from the request's `Host` header (which an attacker can fake)
- [ ] **At most one email per address per 60 seconds.** Asking again sooner on "Send the email again" or
      "Forgot password" → "Please wait a minute before asking for another email" (only where this reveals nothing more
      than the form already does)
- [ ] Brevo down or slow → the action still saves what it can and says "We couldn't send the email right now.
      Please try again in a minute." – no crash
- [ ] **Local development without a Brevo key:** the email is printed to the server terminal instead of sent,
      so teammates can test without the key. On Vercel a missing key is an error, never a silent print
- [ ] New environment variables with placeholders in `.env.example`: `BREVO_API_KEY`, `EMAIL_FROM`, `APP_URL`

### Server rules
- [ ] **Passwords** are stored only as **scrypt** hashes with a random salt per password (Node's built-in `crypto`,
      no new package). Nothing can turn the hash back into the password
- [ ] **Session tokens and email-link tokens** are stored only as **SHA-256 hashes**, like room tokens (decision 012).
      A leaked copy of the database cannot be used to log in or to reset a password
- [ ] No route ever returns a password hash, a token hash or another person's email
- [ ] Every input is validated on the server (type, length, allowed characters, body size). Errors come back as
      `{ error, message }` with the usual status codes (400 bad input, 401 not logged in / wrong login,
      403 not verified, 404 unknown, 409 username taken, 429 too soon, 500 unexpected)
- [ ] **Simultaneous sign-ups** with the same username (any case) or email: exactly one wins; the database enforces it

### Routes (`app/api/accounts/…`)
| Route | Does |
|---|---|
| `POST /signup` | email, username, password → "check your inbox" |
| `POST /verify-email` | token → verified |
| `POST /resend-verification` | email → "if an unverified account exists, we sent it" |
| `POST /login` | username or email, password → sets the session cookie |
| `POST /logout` | ends the session, clears the cookie |
| `GET /me` | `{ username }` or `{ username: null }` |
| `POST /forgot-password` | email → always the same answer |
| `POST /reset-password` | token, new password → changed, all sessions ended |

### Where the code goes (same pattern as the solo game)
- `lib/accounts/` – rules without database: username/email/password checks, "email or username?", scrypt hashing,
  token creation and hashing, link lifetimes
- `lib/email/` – Brevo call, the three email texts, building links, the "print instead" fallback
- `lib/db/accounts.ts` – all SQL for users, sessions and email tokens
- `lib/api/accounts.ts` – what each route does step by step; `app/api/accounts/...` only calls it
- `lib/client/account-api.ts` – the browser's calls to these routes
- Pages: `app/page.tsx` (landing), `app/solo/page.tsx`, `app/signup`, `app/login`, `app/verify-email`,
  `app/forgot-password`, `app/reset-password`, `app/join/[code]`
- `CLAUDE.md` folder list gets `lib/accounts/` and `lib/email/` (tell Niklas, owner of `CLAUDE.md`)

### Database
| Table | Columns | Rules in the database |
|---|---|---|
| `users` | id (uuid), username, email, password_hash, email_verified_at (empty until verified), last_email_sent_at, created_at | username 3–20 characters, unique ignoring case; email stored lowercase, unique |
| `sessions` | token_hash, user_id, created_at, expires_at | token_hash = 64 hex characters, primary key; deleting a user deletes their sessions |
| `email_tokens` | token_hash, user_id, purpose (`verify` / `reset`), expires_at, used_at | token_hash = 64 hex characters, primary key; deleting a user deletes their tokens |

- Rooms are not linked to users in this spec. Making "create room" require a login is part of the room pages
  (spec 002 steps 3–4), which will add the link.

### Tests
Three seams, agreed on 15 Nov 2026. Almost everything is tested through the first one; `lib/accounts/` and
`lib/db/accounts.ts` get no tests of their own, because the API tests cover them from above.

- [ ] **Seam 1 – `lib/api/accounts.ts`** with PGlite and swappable pieces (clock, fake email sender, token maker),
      like `tests/api/games.test.ts`. Each action returns `{ status, body }` plus a cookie instruction for log in /
      log out. Covers the username/email/password rules (2 vs 3 and 20 vs 21 characters, `@`, spaces, accents, emoji;
      passwords 7/8/128/129), salted hashes, token lifetimes at the edges, and only hashes stored. **Accepted and
      rejected** actions:
  - sign up: new; username taken in another case; email already verified (no account created, "already" email sent,
    same reply); email unverified (replaced); bad inputs; two at once with the same username → one wins
  - verify: OK, expired, used twice, unknown
  - log in: by username, by email, either in another case; wrong password and unknown account give the same reply;
    not verified → 403
  - log out; `me` with valid, expired, unknown and no session
  - forgot password: known and unknown email give the same reply; second request within 60 s → 429
  - reset: OK (old sessions end, email verified), expired, used twice, bad password
  - no reply ever contains a password hash, token hash or another person's email
- [ ] **Seam 2 – `lib/email/`** with a fake `fetch`, like `tests/music/itunes.test.ts`: sent, Brevo error code,
      timeout, network error; links use `APP_URL`, then `VERCEL_URL`, then localhost; no key in development →
      printed, no key on Vercel → error
- [ ] **Seam 3 – `lib/client/`:** room code check on the landing page (6 digits, letters, 5 or 7 digits, spaces trimmed)
- [ ] Pages are checked by hand on the Vercel preview (see "Done when"), like the solo screens
- [ ] No test calls the real Brevo API or the real Neon database

## Out of scope
- The room pages, game modes, and linking rooms to accounts (spec 002, step 4 "Connect")
- Login with Google/GitHub, deleting an account, changing username or email, a profile page
- A lockout after wrong passwords and a full rate limiter (decision 014, limits)
- Freeing usernames held by accounts that were never verified
- Email design beyond plain and readable

## Done when
- On the **Vercel preview URL**: the landing page explains the game; someone signs up, gets the email, verifies,
  logs in, sees "Logged in as …", logs out, resets the password through "Forgot password?", and logs in with the new one.
- Play solo works as before at `/solo`; a 6-digit code goes to `/join/<code>`; anything else shows the message.
- The browser's network tab and the database never show a password, a session token or an email-link token in plain text.
- Signing up with an already registered email, or asking for a reset for an unknown one, looks exactly like the normal case.
- `npm test` passes locally and in the GitHub Action; `npm audit` reports 0 vulnerabilities; no new package.
- New decision `docs/decisions/014-accounts.md` (accounts only for creating rooms, scrypt, sessions, email
  verification, Brevo, what is left out and why) and an "Update 15 Nov 2026" in `007-no-accounts.md`.
- `README.md` and `.env.example` list the three new environment variables.

## Suggested order (one branch and pull request each)
1. `feature/accounts` – `GLOSSARY.md`, this spec, tables, `lib/accounts/`, `lib/email/`, `lib/db/accounts.ts`,
   `lib/api/accounts.ts`, routes, decision 014 + update to 007, tests
2. `feature/landing-page` – landing page, solo moved to `/solo`, the account pages, `/join/[code]` placeholder

Before step 1 can be checked on Vercel, someone creates a free Brevo account, verifies a sender address
(a team address rather than a personal one) and puts `BREVO_API_KEY`, `EMAIL_FROM` and `APP_URL` into the
Vercel settings and their own `.env.local`.

## Decided on 15 Nov 2026 (Jasper, grilling session with Claude)
- Accounts are needed only to create a room; solo and joining with a room code stay open to guests (Q6–Q8)
- Everyone chooses a nickname per game; a username is not a nickname (Q7, `GLOSSARY.md`)
- Username/email/password rules as above; email verification required before logging in (Q9, Q15)
- scrypt for passwords; hashed session and email-link tokens; `httpOnly` cookie (Q10, Q16)
- "Forgot password" in; Google/GitHub login, account deletion and a lockout out (Q11, Q12)
- Brevo for emails, called with `fetch`, at most one email per address per minute (Q14, Q20)
- Sign-up and reset never reveal whether an email is registered (Q16, Q17)
- Room code box goes to `/join/<code>`, a placeholder for now (Q18); separate pages per step (Q19)
- Added while writing the spec, to be confirmed: an unverified account is replaced when someone signs up with
  the same email again; a password reset also verifies the email; links fall back to `VERCEL_URL`; without a
  Brevo key, local development prints emails to the terminal
