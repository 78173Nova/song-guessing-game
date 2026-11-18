// Time left in a round: a thin bar that empties over the 15 seconds, shrinking with transform (never width).
// Used under the solo stage, the Multiplayer game board and the duel.
// - left: seconds left, not rounded; null = the answer is sent and the bar stays empty.
// - className: the bar's width, which differs per screen.
import { timeLeftFraction } from "@/lib/client/solo-view";
import shared from "./GameShared.module.css";

export default function TimeBar({ left, className }: { left: number | null; className?: string }) {
  return (
    <div className={className ? `${shared.timeTrack} ${className}` : shared.timeTrack} aria-hidden="true">
      <div className={shared.timeFill} style={{ transform: `scaleX(${timeLeftFraction(left)})` }} />
    </div>
  );
}
