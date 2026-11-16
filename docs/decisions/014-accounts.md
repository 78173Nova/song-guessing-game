# 014 – Accounts

Date: 16 Nov 2026 · Status: started (sign-up built, issue #24). Verification, login and sessions,
email delivery through Brevo and password reset are added here as updates by their issues (#25–#29).

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
- **The database decides who wins:** a unique index on `lower(username)` and a unique `email`. Sign-up
  runs one transaction (delete the unverified account with that email, insert with `ON CONFLICT DO
  NOTHING`, then read why nothing was inserted), so of two sign-ups at the same moment exactly one wins.
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
- **Same reply every time:** the sign-up page never tells a stranger whether an email is registered.
- **Rules in the database:** they hold even if the code has a mistake, and they handle requests at the same moment.

## Alternatives
- **Login with Google/GitHub:** less to build securely, but more setup and an outside dependency (out of scope).
- **bcrypt or argon2:** good as well, but need a package; scrypt is built in.
- **Telling the user "this email is taken":** clearer, but reveals who has an account.

## Limits
- Usernames held by accounts that are never verified stay taken until someone signs up again with that
  email (no clean-up job).
- "Looks like an email" does not prove the address exists; only opening the link does.
- Without Brevo (until #25) emails are only printed, so sign-up works only on a laptop with access to the terminal.

## How it could change
- Brevo delivery (#25), verification (#26), login and sessions (#27), resend (#28) and password reset (#29)
  extend `lib/accounts/`, `lib/email/`, `lib/db/accounts.ts` and `lib/api/accounts.ts`.
- A login provider could later be linked to the same `users` table.
