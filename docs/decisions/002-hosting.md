# 002 – Hosting on Vercel

Date: 10 Nov 2026 · Status: decided

## Decision
The app runs on Vercel (free plan). Vercel deploys every change on `main` automatically
and builds a separate preview URL for every pull request.

## Why
- Vercel is made for Next.js: connect the repository and it works – almost no configuration.
- **Automatic deploys from `main`:** what is merged is online. No "old version deployed".
- **Preview URL per pull request:** the reviewer can click through a feature before it reaches `main`.
- Free, no credit card required.

## Alternatives
- **Render / Railway:** keep running (good for WebSockets), but free plans sleep or expire.
- **Fly.io / Google Cloud Run (containers):** flexible, but more setup and usually a credit card.
- **Streamlit Community Cloud:** Streamlit only.

## Limits
- Vercel runs server code in **short-lived functions**. Long-lived connections (WebSockets) are not
  possible – hence polling for multiplayer (see 008).
- The free plan has usage limits and is meant for non-commercial use – fine for a course project.
- On the free plan only the account owner has access to the dashboard (logs, environment variables).
- Secrets in the local `.env.local` do not reach Vercel automatically – they must be added in the Vercel settings.

## How it could change
If we needed real long-lived connections, the multiplayer part could move to a real-time service
(Ably, Pusher) or a host with WebSocket support; the rest could stay on Vercel.
