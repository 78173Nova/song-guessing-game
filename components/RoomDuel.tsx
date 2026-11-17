// The duel layout of a room round (issue #39), for a game with exactly two players: the opponent's nickname and
// score at the top, facing the viewer; the song in the middle; the viewer's nickname and score at the bottom, just
// above the answer buttons (which Room.tsx shows below, the same as on the Multiplayer game board). The opponent
// gets a tick once they have answered, never what they answered. Which side shows what: lib/client/room-duel.ts.
import { ROUND_SECONDS } from "@/lib/client/countdown";
import { duelSides } from "@/lib/client/room-duel";
import { avatarEmoji } from "@/lib/game/avatars";
import styles from "./RoomDuel.module.css";

export default function RoomDuel({
  players,
  away,
  avatars,
  me,
  standings,
  answered,
  iAnswered,
  number,
  totalRounds,
  secondsLeft,
}: {
  players: string[];
  away: string[]; // players whose device has not asked for 5 s (issue #40)
  avatars: Record<string, string>; // each player's avatar id by nickname (issue #44)
  me: string;
  standings: { nickname: string; score: number }[]; // closed rounds only, so the scores change after each round
  answered: string[]; // who has answered the round on screen
  iAnswered: boolean; // the viewer's own tap counts at once, before the next reply
  number: number;
  totalRounds: number;
  secondsLeft: number;
}) {
  const sides = duelSides({ players, away, me: { nickname: me }, standings }, answered);
  const played = Math.min(1, Math.max(0, 1 - secondsLeft / ROUND_SECONDS));

  return (
    <div className={styles.duel}>
      <div className={styles.opponent} aria-label="Your opponent">
        {sides.opponent === null ? (
          <p className={styles.name}>Your opponent has left</p>
        ) : (
          <>
            <p className={styles.score} aria-label={`${sides.opponent.nickname}'s score`}>
              {sides.opponent.score}
            </p>
            <p className={sides.opponent.answered ? `${styles.name} ${styles.answered}` : styles.name}>
              {sides.opponent.answered && <span aria-label="has answered">✓ </span>}
              {sides.opponent.away && (
                <span role="img" aria-label="away" title="Away – not connected">
                  ⏳{" "}
                </span>
              )}
              <span aria-hidden="true">{avatarEmoji(avatars[sides.opponent.nickname])} </span>
              <span className={styles.nickname} title={sides.opponent.nickname}>
                {sides.opponent.nickname}
              </span>
            </p>
          </>
        )}
      </div>

      <div
        className={styles.song}
        role="timer"
        aria-label={`Round ${number} of ${totalRounds}, ${secondsLeft} seconds left`}
      >
        {/* A full circle that fills up while the clip plays. */}
        <svg viewBox="0 0 100 100" aria-hidden="true" className={styles.ring}>
          <circle cx="50" cy="50" r="44" className={styles.track} pathLength={1} />
          <circle
            cx="50"
            cy="50"
            r="44"
            className={styles.progress}
            pathLength={1}
            strokeDasharray={`${played} 1`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className={styles.songText} aria-hidden="true">
          <span className={styles.seconds}>{secondsLeft}</span>
          <span className={styles.round}>
            Round {number}/{totalRounds}
          </span>
        </div>
      </div>

      <div className={styles.me}>
        <p className={styles.name}>
          {iAnswered && <span aria-label="you have answered">✓ </span>}
          <span aria-hidden="true">{avatarEmoji(avatars[sides.me.nickname])} </span>
          <span className={styles.nickname}>{sides.me.nickname}</span>
        </p>
        <p className={styles.score} aria-label="Your score">
          {sides.me.score}
        </p>
      </div>
    </div>
  );
}
