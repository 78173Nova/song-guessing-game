// Countdowns as the page shows them: the one during a round, and the room countdowns (lobby, list). The server
// measures the real time; this is only the display.
export const ROUND_SECONDS = 15;

// Whole seconds left after `elapsedMs` milliseconds, between 0 and 15.
export function secondsLeft(elapsedMs: number): number {
  const left = Math.ceil((ROUND_SECONDS * 1000 - elapsedMs) / 1000);
  return Math.min(ROUND_SECONDS, Math.max(0, left));
}

// Milliseconds left as "m:ss", whole seconds rounded up (so 0:00 only shows at the end), e.g. "0:42".
export function formatCountdown(msLeft: number): string {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// How far the server's clock is ahead of this device's: the server's time in a reply (`serverNow`) minus this
// device's clock when the reply arrived (Date.now()). The time the reply took to travel is ignored: well under a
// second. Add it to Date.now() to get the server's time.
export function serverClockOffset(serverNow: string, receivedAt: number): number {
  return Date.parse(serverNow) - receivedAt;
}
