# 001 – Stack: Next.js (TypeScript) instead of Python/Streamlit

Date: 10 Nov 2026 · Status: decided, **teaching staff approval pending**

## Decision
We build the app with Next.js (App Router) and TypeScript. UI and server routes live in one project.

## Why
- Our product is a **game** with audio, a countdown, animations and several players at once.
  The course guide names exactly these as things Streamlit does not do well.
- Streamlit reruns the whole script on every click and keeps state separately per user.
  A shared game room with a live leaderboard would be hard to build.
- Next.js is built for **mobile layouts** – important, because the audience plays on their phones via QR code.
- One project for UI and server: not two separate parts that everyone has to understand.
- Fits Vercel directly (see 002).

## Alternatives
- **Streamlit:** course default, no approval needed, but weak for game feel and multiplayer.
- **Python backend (FastAPI) + separate web page:** full control, but two parts in two languages.
- **Other JS frameworks (SvelteKit, Vite + React):** similar, but a smaller community or no built-in server.

## Limits / costs
- A different language and different tools from the course (TypeScript, npm, Vitest instead of Python, uv, pytest).
  The team has to be able to read TypeScript, even though Claude Code writes it.
- Needs approval from the teaching staff. If refused, we must switch early.

## How it could change
The game logic deliberately lives in `lib/game/` with no dependency on the UI or the database.
It could be ported to another language without rethinking the rest.
