// Points for one answer (spec 001): 100 for correct plus a speed bonus of up to 50 that falls linearly
// over 15 seconds, rounded to whole points. Wrong or later than 15 seconds = 0.
export const ANSWER_TIME_SECONDS = 15;
const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 50;

export function scoreAnswer(correct: boolean, startedAt: Date, answeredAt: Date): number {
  // A negative time (clocks slightly off) counts as 0 seconds, so nobody gets more than the maximum.
  const seconds = Math.max(0, (answeredAt.getTime() - startedAt.getTime()) / 1000);
  if (!correct || seconds > ANSWER_TIME_SECONDS) return 0;
  return BASE_POINTS + Math.round(MAX_SPEED_BONUS * (1 - seconds / ANSWER_TIME_SECONDS));
}
