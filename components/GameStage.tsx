// The stage of the solo round and reveal and of the room result: a fixed square with the wave circle behind a
// solid disc. The disc holds whatever the screen puts inside (the seconds, 3-2-1, a play icon, a check or a cross).
// - analyser: the playing clip's sound analyser; null = the circle idles.
// - colours: the circle's colours. Leave it out to keep the app's own colours, the only choice while a round is
//   open (CLAUDE.md rule 5); the album cover's colours (#64) are passed only once the answer is revealed.
import type { CoverColours } from "@/lib/client/cover-colours";
import WaveCircle from "./WaveCircle";
import shared from "./GameShared.module.css";

export default function GameStage({
  analyser,
  colours,
  children,
}: {
  analyser: AnalyserNode | null;
  colours?: CoverColours;
  children: React.ReactNode;
}) {
  return (
    <div className={shared.stage}>
      <WaveCircle analyser={analyser} colours={colours} className={shared.wave} />
      <div className={shared.disc}>{children}</div>
    </div>
  );
}
