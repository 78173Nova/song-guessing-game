// The game board of a Multiplayer room round (issue #38): the song as the top half of the wave circle, which
// ripples to the clip that is playing, with the seconds left inside it; every other player's nickname around it
// with a check once they have answered; and the viewer's own nickname, larger, just above the answer buttons.
// Nobody sees what anyone else answered: the room state only says who. Where each nickname sits is worked out in
// lib/client/room-board.ts.
//
// The circle uses the app's own colours only (CLAUDE.md rule 5: nothing about the song before the answer).
import NumberFlow from "@number-flow/react";
import { BOARD, boardSeats, SEAT, SONG_RADIUS } from "@/lib/client/room-board";
import { avatarEmoji } from "@/lib/game/avatars";
import AwayIcon from "./icons/AwayIcon";
import CheckIcon from "./icons/CheckIcon";
import TimeBar from "./TimeBar";
import WaveCircle from "./WaveCircle";
import styles from "./RoomBoard.module.css";

// Board units as a share of the board's width or height, for CSS.
const across = (units: number) => `${(units / BOARD.width) * 100}%`;
const down = (units: number) => `${(units / BOARD.height) * 100}%`;

export default function RoomBoard({
  players,
  away,
  avatars,
  me,
  answered,
  iAnswered,
  number,
  totalRounds,
  secondsLeft,
  timeLeft,
  analyser,
}: {
  players: string[];
  away: string[]; // players whose device has not asked for 5 s: muted, with the away icon (issue #40)
  avatars: Record<string, string>; // each player's avatar id by nickname (issue #44)
  me: string;
  answered: string[]; // who has answered the round on screen
  iAnswered: boolean; // the viewer's own tap counts at once, before the next reply
  number: number;
  totalRounds: number;
  secondsLeft: number;
  timeLeft: number; // seconds left, not rounded, for the time bar under the board
  analyser: AnalyserNode | null; // the playing clip's sound analyser; null = the circle idles
}) {
  const seats = boardSeats(players, me, answered);

  return (
    <div className={styles.table}>
      <div className={styles.board}>
        <p className={styles.round}>
          Round {number} / {totalRounds}
        </p>
        <ul className={styles.seats} aria-label="Other players">
          {seats.map((seat) => {
            const isAway = away.includes(seat.nickname);
            const className = [styles.seat, seat.answered && styles.answered, isAway && styles.away]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={seat.nickname}
                className={className}
                style={{ left: across(seat.x), top: down(seat.y), width: across(SEAT.width), height: down(SEAT.height) }}
                title={isAway ? `${seat.nickname} – away, not connected` : seat.nickname}
              >
                <span className={styles.avatar} aria-hidden="true">
                  {avatarEmoji(avatars[seat.nickname])}
                </span>
                <span className={styles.name}>{seat.nickname}</span>
                {/* The marks come after the name, so a screen reader says "Mila, has answered". */}
                {seat.answered && (
                  <span className={styles.mark} role="img" aria-label="has answered">
                    <CheckIcon size={12} className={styles.icon} />
                  </span>
                )}
                {isAway && (
                  <span className={styles.mark} role="img" aria-label="away">
                    <AwayIcon size={12} className={styles.icon} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {/* The top half of the wave circle, standing on the board's bottom edge (where the song half circle
            used to be, same size, so no nickname overlaps it). The seconds sit on its solid half disc. */}
        <div
          className={styles.song}
          style={{ width: across(2 * SONG_RADIUS), height: down(SONG_RADIUS) }}
          role="timer"
          aria-label={`Round ${number} of ${totalRounds}, ${secondsLeft} seconds left`}
        >
          <WaveCircle analyser={analyser} className={styles.wave} />
          <div className={styles.disc} aria-hidden="true">
            <NumberFlow
              value={secondsLeft}
              className={secondsLeft <= 5 ? `${styles.seconds} ${styles.low}` : styles.seconds}
            />
          </div>
        </div>
      </div>
      {/* Time left: the board's base line, shrinking with transform (never width). */}
      <TimeBar left={timeLeft} className={styles.timeTrack} />
      <p className={styles.me}>
        <span className={styles.avatar} aria-hidden="true">
          {avatarEmoji(avatars[me])}
        </span>
        <span className={styles.name}>{me}</span>
        <span className={styles.you}>(you)</span>
        {iAnswered && (
          <span className={styles.meAnswered}>
            <CheckIcon size={18} />
            Answered
          </span>
        )}
      </p>
    </div>
  );
}
