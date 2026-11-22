// The duel layout of a room round (issues #39, #66), for a game with exactly two players: the opponent's side on
// top in cyan, facing the viewer; the wave circle in the middle with the seconds inside it; the viewer's side at
// the bottom in violet, just above the answer buttons (which Room.tsx shows below, the same as on the Multiplayer
// game board). On a laptop the same stack, centred and bigger (team feedback point 8). Each nickname shrinks to fit
// its line instead of being cut off: the CSS gets its length as --chars (RoomDuel.module.css). Once the opponent
// has answered they get the word "Answered" on a neutral grey pill (no tick, no green: team feedback, PR #74), never what they
// answered. Which side shows what: lib/client/room-duel.ts.
//
// The circle uses the app's own colours only (CLAUDE.md rule 5: nothing about the song before the answer); the
// cover's colours appear on the result screen, in Room.tsx.
import NumberFlow from "@number-flow/react";
import { useEffect, useState, type CSSProperties } from "react";
import { duelSides, type ScoreMemory } from "@/lib/client/room-duel";
import { avatarEmoji } from "@/lib/game/avatars";
import AwayIcon from "./icons/AwayIcon";
import TimeBar from "./TimeBar";
import WaveCircle from "./WaveCircle";
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
  timeLeft,
  analyser,
  scores,
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
  timeLeft: number; // seconds left, not rounded, for the time bar under the duel
  analyser: AnalyserNode | null; // the playing clip's sound analyser; null = the circle idles
  scores: ScoreMemory; // the scores the viewer saw last, so each one rolls up after a round (issue #66)
}) {
  const sides = duelSides({ players, away, me: { nickname: me }, standings }, answered);
  const opponent = sides.opponent;

  return (
    <div className={styles.wrap}>
      <div className={styles.duel}>
        <section className={`${styles.side} ${styles.opponent}`} aria-label="Your opponent">
          {opponent === null ? (
            <p className={styles.gone}>Your opponent has left</p>
          ) : (
            <>
              <div className={styles.nameBox}>
                <p className={styles.nameRow} title={opponent.nickname} style={nameLength(opponent.nickname)}>
                  <span className={styles.avatar} aria-hidden="true">
                    {avatarEmoji(avatars[opponent.nickname])}
                  </span>
                  <span className={styles.name}>{opponent.nickname}</span>
                </p>
              </div>
              <div className={styles.marks}>
                {opponent.answered && (
                  <span className={styles.answered}>
                    Answered
                  </span>
                )}
                {opponent.away && (
                  <span className={styles.away} title="Away – not connected">
                    <AwayIcon size={16} />
                    Away
                  </span>
                )}
              </div>
              <Score nickname={opponent.nickname} value={opponent.score} scores={scores} />
            </>
          )}
        </section>

        <div className={styles.centre}>
          <div
            className={styles.song}
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
          <p className={styles.round} aria-hidden="true">
            Round {number} / {totalRounds}
          </p>
        </div>

        <section className={`${styles.side} ${styles.me}`} aria-label="You">
          <div className={styles.nameBox}>
            <p className={styles.nameRow} title={sides.me.nickname} style={nameLength(sides.me.nickname)}>
              <span className={styles.avatar} aria-hidden="true">
                {avatarEmoji(avatars[sides.me.nickname])}
              </span>
              <span className={styles.name}>{sides.me.nickname}</span>
            </p>
          </div>
          <div className={styles.marks}>
            <span className={styles.you}>(you)</span>
            {iAnswered && (
              <span className={styles.answered}>
                Answered
              </span>
            )}
          </div>
          <Score nickname={sides.me.nickname} value={sides.me.score} scores={scores} />
        </section>
      </div>
      {/* Time left: the same base line as under the game board, shrinking with transform (never width). */}
      <TimeBar left={timeLeft} className={styles.timeTrack} />
    </div>
  );
}

// The nickname's length in whole characters (an emoji counts as one, like lib/game/rooms.ts), as the CSS variable
// --chars: RoomDuel.module.css uses it to pick a font size at which the whole nickname fits its line.
function nameLength(nickname: string): CSSProperties {
  return { "--chars": [...nickname].length } as CSSProperties;
}

// A large score that rolls from the value the viewer saw last to the new one (NumberFlow), one frame after the
// duel appears. With "reduce motion" on, NumberFlow shows the number straight away.
function Score({ nickname, value, scores }: { nickname: string; value: number; scores: ScoreMemory }) {
  const [shown, setShown] = useState(() => scores.startOf(nickname, value));
  useEffect(() => {
    scores.remember(nickname, value);
    const frame = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(frame);
  }, [scores, nickname, value]);
  return (
    <p className={styles.score}>
      <span className={styles.scoreLabel}>Score</span>
      <NumberFlow value={shown} className={styles.scoreNumber} />
    </p>
  );
}
