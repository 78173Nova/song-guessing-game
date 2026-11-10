// The countdown shown during a round. The server measures the real time; this is only the display.
export const ROUND_SECONDS = 15;

// Whole seconds left after `elapsedMs` milliseconds, between 0 and 15.
export function secondsLeft(elapsedMs: number): number {
  const left = Math.ceil((ROUND_SECONDS * 1000 - elapsedMs) / 1000);
  return Math.min(ROUND_SECONDS, Math.max(0, left));
}
