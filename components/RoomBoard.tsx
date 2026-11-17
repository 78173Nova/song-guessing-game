// The game board of a Multiplayer room round (issue #38): the song as a half circle that fills up while the clip
// plays, every other player's nickname around it with a tick once they have answered, and the viewer's own
// nickname, larger, just above the answer buttons. Nobody sees what anyone else answered: the room state only
// says who. Where each nickname sits is worked out in lib/client/room-board.ts.
import { ROUND_SECONDS } from "@/lib/client/countdown";
import { BOARD, boardSeats, SEAT, SONG_RADIUS } from "@/lib/client/room-board";
import styles from "./RoomBoard.module.css";

// Board units as a share of the board's width or height, for CSS.
const across = (units: number) => `${(units / BOARD.width) * 100}%`;
const down = (units: number) => `${(units / BOARD.height) * 100}%`;

export default function RoomBoard({
  players,
  me,
  answered,
  iAnswered,
  number,
  totalRounds,
  secondsLeft,
}: {
  players: string[];
  me: string;
  answered: string[]; // who has answered the round on screen
  iAnswered: boolean; // the viewer's own tap counts at once, before the next reply
  number: number;
  totalRounds: number;
  secondsLeft: number;
}) {
  const seats = boardSeats(players, me, answered);
  const played = Math.min(1, Math.max(0, 1 - secondsLeft / ROUND_SECONDS));

  return (
    <div className={styles.table}>
      <div className={styles.board}>
        <ul className={styles.seats} aria-label="Other players">
          {seats.map((seat) => (
            <li
              key={seat.nickname}
              className={seat.answered ? `${styles.seat} ${styles.answered}` : styles.seat}
              style={{ left: across(seat.x), top: down(seat.y), width: across(SEAT.width), height: down(SEAT.height) }}
              title={seat.nickname}
            >
              {seat.answered && <span aria-label="has answered">✓ </span>}
              <span className={styles.name}>{seat.nickname}</span>
            </li>
          ))}
        </ul>
        <div
          className={styles.song}
          style={{ width: across(2 * SONG_RADIUS), height: down(SONG_RADIUS) }}
          role="timer"
          aria-label={`Round ${number} of ${totalRounds}, ${secondsLeft} seconds left`}
        >
          {/* A half circle: the dark arc is the clip still to come, the coloured arc the part already played. */}
          <svg viewBox="0 0 100 50" aria-hidden="true" className={styles.arc}>
            <path d="M 5 50 A 45 45 0 0 1 95 50" className={styles.track} pathLength={1} />
            <path
              d="M 5 50 A 45 45 0 0 1 95 50"
              className={styles.progress}
              pathLength={1}
              strokeDasharray={`${played} 1`}
            />
          </svg>
          <div className={styles.songText} aria-hidden="true">
            <span className={styles.seconds}>{secondsLeft}</span>
            <span className={styles.round}>
              Round {number}/{totalRounds}
            </span>
          </div>
        </div>
      </div>
      <p className={styles.me}>
        {iAnswered && <span aria-label="you have answered">✓ </span>}
        {me}
      </p>
    </div>
  );
}
