"use client";

// The solo game screens. This file only shows things, plays the clips and reports clicks:
// - which screen comes next is decided by gameReducer (lib/client/game-state.ts)
// - loading, retrying and swapping clips is decided by prepareClip (lib/client/clip-loader.ts)
// - the server calls are in lib/client/game-api.ts
// - the server checks every answer; the browser never knows the correct answer before answering
import NumberFlow from "@number-flow/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  canPlayPreviews,
  prepareClip,
  UNSUPPORTED_BROWSER_MESSAGE,
  withTimeout,
} from "@/lib/client/clip-loader";
import { ROUND_SECONDS, secondsLeft } from "@/lib/client/countdown";
import { apiAnswer, apiNextRound, apiReplace, apiStartGame } from "@/lib/client/game-api";
import { rememberGame } from "@/lib/client/recent-games";
import { gameReducer, initialState, type Answer, type GameState, type RoundInfo } from "@/lib/client/game-state";
import { optionMark, timeLeftFraction, verdictOf, type OptionMark } from "@/lib/client/solo-view";
import { useCoverColours } from "@/lib/client/useCoverColours";
import { createWaveAudio, type WaveAudio } from "@/lib/client/wave-audio";
import { DECADES, type Decade } from "@/lib/game/filters";
import { GENRE_LABELS, GENRES, type Genre } from "@/lib/game/genres";
import { MODES, QUESTION_LABELS, type Mode } from "@/lib/game/modes";
import { ROUNDS_PER_GAME } from "@/lib/game/rounds";
import CheckIcon from "./icons/CheckIcon";
import CrossIcon from "./icons/CrossIcon";
import PlayIcon from "./icons/PlayIcon";
import styles from "./SoloGame.module.css";
import WaveCircle from "./WaveCircle";

// A tiny silent sound. Playing it once on each player during the Start tap "unlocks" the players on
// phones, so the clips may start later without another tap.
const SILENT_SOUND = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const GET_READY_SECONDS = 3;
const CLIP_LOAD_LIMIT_MS = 10_000; // one attempt to load one clip
const FIRST_CLIP_LIMIT_MS = 30_000; // everything for the first clip, including swaps

type Reveal = Extract<GameState, { screen: "reveal" }>;

export default function SoloGame() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  // The latest state, for audio events that arrive outside React.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  // One audio player per round, created during the Start tap.
  const playersRef = useRef<HTMLAudioElement[]>([]);
  // Connects the players to the sound analyser for the wave circle (created in the first Start tap).
  const waveAudioRef = useRef<WaveAudio | null>(null);
  // The analyser once a clip is routed through it; null = the circle idles.
  const [waveAnalyser, setWaveAnalyser] = useState<AnalyserNode | null>(null);
  // "gameId:round" an answer was already sent for – stops a click and the timer both sending one.
  const answeredRef = useRef<string | null>(null);
  // "gameId:round" whose start was already requested – stops a round being requested twice.
  const startedRef = useRef<string | null>(null);
  // The round the server already sent, kept while waiting for a "Tap to start".
  const loadedRoundRef = useRef<{ key: string; round: RoundInfo } | null>(null);
  const [getReadyAt, setGetReadyAt] = useState(0);
  const [roundStartedAt, setRoundStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  // The mode chosen on the start screen. "Play again", "Try again" and "Change settings" keep it.
  const [mode, setMode] = useState<Mode>("title");
  // The filters chosen on the start screen (undefined = Any). "Play again", "Try again" and "Change settings"
  // keep them.
  const [genre, setGenre] = useState<Genre | undefined>(undefined);
  const [decade, setDecade] = useState<Decade | undefined>(undefined);
  // The last 3 games, newest first, sent with the next start so their songs are avoided. Memory only:
  // a reload forgets them.
  const recentGamesRef = useRef<string[]>([]);

  const sendAnswer = useCallback(async (gameId: string, round: number, answer: Answer) => {
    const key = `${gameId}:${round}`;
    if (answeredRef.current === key) return;
    answeredRef.current = key;
    dispatch({ type: "answer", answer });
    const result = await apiAnswer(gameId, round, answer);
    dispatch(result.ok ? { type: "answer-result", result: result.data } : { type: "failed", message: result.message });
  }, []);

  function pauseAll() {
    for (const player of playersRef.current) player.pause();
  }

  // A clip that stops working while its round is on screen → skip the round (0 points, song still shown).
  function handlePlayerError(player: HTMLAudioElement, index: number) {
    const current = stateRef.current;
    if (player.error?.code === MediaError.MEDIA_ERR_ABORTED) return; // just a cancelled load
    if (current.screen !== "round" || current.round.round !== index + 1 || current.pending !== null) return;
    sendAnswer(current.gameId, index + 1, "skip");
  }

  // Loads `url` into the player of round `index`. true = the browser says it can play to the end.
  function loadClip(player: HTMLAudioElement, url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        player.removeEventListener("canplaythrough", onReady);
        player.removeEventListener("error", onError);
        resolve(ok);
      };
      const onReady = () => finish(true);
      const onError = () => {
        if (player.error?.code !== MediaError.MEDIA_ERR_ABORTED) finish(false);
      };
      const timer = setTimeout(() => finish(false), CLIP_LOAD_LIMIT_MS);
      player.addEventListener("canplaythrough", onReady);
      player.addEventListener("error", onError);
      player.src = url;
      player.load();
    });
  }

  // Load → retry → swap the song (server) → give up. See prepareClip.
  function prepare(players: HTMLAudioElement[], gameId: string, index: number, url: string) {
    return prepareClip(
      url,
      (u) => loadClip(players[index], u),
      async () => {
        const replaced = await apiReplace(gameId, index + 1);
        if (!replaced.ok) return null;
        dispatch({ type: "clip-replaced", gameId, index, url: replaced.data.previewUrl });
        return replaced.data.previewUrl;
      },
    );
  }

  async function handleStart() {
    if (!canPlayPreviews((type) => new Audio().canPlayType(type))) {
      dispatch({ type: "failed", message: UNSUPPORTED_BROWSER_MESSAGE });
      return;
    }
    pauseAll();
    // Still inside the tap: start the sound analyser (phones allow this only in a tap) and let go of the
    // previous game's players.
    const waveAudio = (waveAudioRef.current ??= createWaveAudio());
    waveAudio.detachAll();
    waveAudio.unlock();
    setWaveAnalyser(null);
    // Still inside the tap: create and unlock one player per round.
    const players = Array.from({ length: ROUNDS_PER_GAME }, (_, index) => {
      const player = new Audio();
      player.preload = "auto";
      player.addEventListener("error", () => handlePlayerError(player, index));
      waveAudio.prepare(player); // before the first src, or the analyser reads only silence
      player.src = SILENT_SOUND;
      player.play().catch(() => {});
      return player;
    });
    playersRef.current = players;
    answeredRef.current = null;
    startedRef.current = null;

    dispatch({ type: "start" });
    const game = await apiStartGame(fetch, mode, { genre, decade }, recentGamesRef.current);
    if (!game.ok) {
      // Too few songs match the filters: back to the start screen, which says so.
      dispatch(game.tooFewSongs ? { type: "start-refused", message: game.message } : { type: "failed", message: game.message });
      return;
    }
    const { gameId, previewUrls } = game.data;
    recentGamesRef.current = rememberGame(recentGamesRef.current, gameId);
    dispatch({ type: "game-created", gameId, previewUrls });

    // Only the first clip is waited for. The 3-2-1 starts the moment it is ready.
    const first = await withTimeout(prepare(players, gameId, 0, previewUrls[0]), FIRST_CLIP_LIMIT_MS, { ok: false as const });
    if (!first.ok) {
      dispatch({ type: "clip-failed", gameId, index: 0 });
      return;
    }
    setGetReadyAt(Date.now());
    setNow(Date.now());
    dispatch({ type: "clip-ready", gameId, index: 0 });

    // The other clips load one after another during the countdown and the first rounds.
    for (let index = 1; index < previewUrls.length; index++) {
      if (playersRef.current !== players) return; // a new game was started meanwhile
      const result = await prepare(players, gameId, index, previewUrls[index]);
      dispatch({ type: result.ok ? "clip-ready" : "clip-failed", gameId, index });
    }
  }

  function handleNext() {
    pauseAll();
    dispatch({ type: "next" });
  }

  function handleTapToStart() {
    if (state.screen !== "tap-to-start") return;
    waveAudioRef.current?.unlock();
    playersRef.current[state.roundNumber - 1]?.play().catch(() => {});
    dispatch({ type: "tapped" });
  }

  // 3 – 2 – 1, then start round 1.
  const getReady = state.screen === "get-ready";
  useEffect(() => {
    if (!getReady) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time - getReadyAt >= GET_READY_SECONDS * 1000) dispatch({ type: "countdown-done" });
    }, 100);
    return () => clearInterval(timer);
  }, [getReady, getReadyAt]);

  // Starting a round: ask the server for the round first, then start the (already loaded) clip and show the
  // buttons in the same moment. The server starts its 15 seconds when the request arrives – earlier only by
  // the time its reply travels back (decision 011, update).
  const startingKey = state.screen === "starting" ? `${state.gameId}:${state.roundNumber}` : null;
  useEffect(() => {
    if (startingKey === null || startedRef.current === startingKey) return;
    startedRef.current = startingKey;
    const [gameId, number] = startingKey.split(":");
    const roundNumber = Number(number);
    const player = playersRef.current[roundNumber - 1];

    (async () => {
      let round = loadedRoundRef.current?.key === startingKey ? loadedRoundRef.current.round : null;
      if (round === null) {
        const next = await apiNextRound(gameId);
        if (!next.ok) {
          dispatch({ type: "failed", message: next.message });
          return;
        }
        round = next.data;
        loadedRoundRef.current = { key: startingKey, round };
      }
      // Route the clip through the analyser when the sound context runs; otherwise it plays as before.
      const waveAudio = waveAudioRef.current;
      if (waveAudio?.attach(player)) setWaveAnalyser(waveAudio.analyser());
      if (player.paused && !player.error) {
        try {
          player.currentTime = 0;
          await player.play();
        } catch (error) {
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            startedRef.current = null; // the tap starts it again, with the round already loaded
            dispatch({ type: "autoplay-blocked" });
            return;
          }
        }
      }
      setRoundStartedAt(Date.now());
      setNow(Date.now());
      dispatch({ type: "round-loaded", round });
      // A clip that was given up on: the round is skipped right away.
      if (player.error) sendAnswer(gameId, roundNumber, "skip");
    })();
  }, [startingKey, sendAnswer]);

  // The 15-second countdown: ticks while the round is open, and sends "timeout" when it reaches 0.
  const roundKey = state.screen === "round" ? `${state.gameId}:${state.round.round}` : null;
  const pending = state.screen === "round" ? state.pending : null;
  useEffect(() => {
    if (roundKey === null || pending !== null) return;
    const [gameId, round] = roundKey.split(":");
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (secondsLeft(time - roundStartedAt) === 0) sendAnswer(gameId, Number(round), "timeout");
    }, 200);
    return () => clearInterval(timer);
  }, [roundKey, pending, roundStartedAt, sendAnswer]);

  // No music on the start, results and error screens, or after leaving the page.
  useEffect(() => {
    if (state.screen === "start" || state.screen === "results" || state.screen === "error") pauseAll();
  }, [state.screen]);
  useEffect(
    () => () => {
      pauseAll();
      waveAudioRef.current?.close();
    },
    [],
  );

  // What the current round asks. The server sends it with each round; without it (older data),
  // title/artist/year games fall back to the chosen mode and mixed games show no question.
  const questionType =
    state.screen === "round" || state.screen === "reveal"
      ? (state.round.questionType ?? (mode === "mixed" ? undefined : mode))
      : undefined;

  // The album cover's colours for the wave circle, only once the answer is revealed (CLAUDE.md rule 5).
  // Outside the reveal this is undefined, so the circle goes back to the app colours before the next round.
  const coverColours = useCoverColours(state.screen === "reveal" ? state.result.song.artworkUrl : null);

  return (
    <div className={styles.game}>
      {state.screen === "start" && (
        <section className={styles.center}>
          <p className={styles.intro}>
            Hear a 30-second clip and pick the right answer. {ROUNDS_PER_GAME} rounds – faster answers score more.
          </p>
          <fieldset className={styles.modes}>
            <legend>What do you want to guess?</legend>
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={m === mode ? `${styles.option} ${styles.chosen}` : styles.option}
                aria-pressed={m === mode}
                onClick={() => setMode(m)}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </fieldset>
          <div className={styles.filters}>
            <label>
              Genre
              <select
                value={genre ?? ""}
                onChange={(e) => setGenre(GENRES.find((g) => g === e.target.value))}
              >
                <option value="">Any</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {GENRE_LABELS[g]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Decade
              <select
                value={decade ?? ""}
                onChange={(e) => setDecade(DECADES.find((d) => String(d) === e.target.value))}
              >
                <option value="">Any</option>
                {DECADES.map((d) => (
                  <option key={d} value={d}>
                    {d}s
                  </option>
                ))}
              </select>
            </label>
          </div>
          {state.message && (
            <p className={styles.error} role="alert">
              <CrossIcon className={styles.inlineIcon} />
              {state.message}
            </p>
          )}
          <button className={`${styles.primary} ${styles.wide}`} onClick={handleStart}>
            Start game
          </button>
        </section>
      )}

      {/* Every screen from loading to the reveal shares one frame: status line, the stage (where the wave
          circle sits) and what belongs under it. The stage stays in place, so the screens follow each
          other calmly instead of jumping. */}
      {inPlay(state) && (
        <section className={styles.play}>
          <StatusLine state={state} />
          {/* The circle follows the music only while a clip plays (round and reveal); otherwise it idles. */}
          <Stage
            analyser={state.screen === "round" || state.screen === "reveal" ? waveAnalyser : null}
            colours={coverColours}
          >
            <StageCentre state={state} now={now} getReadyAt={getReadyAt} roundStartedAt={roundStartedAt} />
          </Stage>

          {(state.screen === "creating" || state.screen === "first-clip") && (
            <p className={styles.message} role="status">
              Loading first song…
            </p>
          )}

          {state.screen === "get-ready" && (
            <p className={styles.message} role="status">
              Get ready!
            </p>
          )}

          {state.screen === "starting" && (
            <p className={styles.message} role="status">
              Round {state.roundNumber}…
            </p>
          )}

          {state.screen === "clip-loading" && (
            <p className={styles.message} role="status">
              Loading next song…
            </p>
          )}

          {state.screen === "tap-to-start" && (
            <div className={styles.message}>
              <p>Your browser needs one more tap to play the sound.</p>
              <button className={`${styles.primary} ${styles.wide}`} onClick={handleTapToStart}>
                <PlayIcon className={styles.inlineIcon} />
                Tap to start
              </button>
            </div>
          )}

          {state.screen === "round" && (
            <TimeBar
              left={state.pending === null ? ROUND_SECONDS - (now - roundStartedAt) / 1000 : null}
            />
          )}

          {state.screen === "reveal" && <RevealPanel state={state} onNext={handleNext} />}

          {/* The server says what each round asks – in mixed games it changes from round to round. */}
          {state.screen === "round" && questionType && (
            <h2 className={styles.question}>{QUESTION_LABELS[questionType]}</h2>
          )}

          {(state.screen === "round" || state.screen === "reveal") && (
            <div className={state.screen === "reveal" ? `${styles.options} ${styles.settled}` : styles.options}>
              {state.round.options.map((title, index) => (
                <AnswerButton
                  key={index}
                  title={title}
                  mark={optionMark(state, index)}
                  disabled={state.screen !== "round" || state.pending !== null}
                  onClick={() => state.screen === "round" && sendAnswer(state.gameId, state.round.round, index)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {state.screen === "results" && (
        <section className={styles.center}>
          <h2 className={styles.finalHeading}>
            Your score
            <span className={styles.finalScore}>{state.score}</span>
          </h2>
          <ol className={`${styles.results} ${styles.soloResults}`}>
            {state.history.map((played) => (
              <li key={played.round}>
                <span className={styles.outcome} data-outcome={played.outcome}>
                  {played.outcome === "correct" ? (
                    <CheckIcon className={styles.inlineIcon} />
                  ) : (
                    <CrossIcon className={styles.inlineIcon} />
                  )}
                  {OUTCOME_WORD[played.outcome]}
                </span>
                <span className={styles.played}>
                  <strong>{played.title}</strong> – {played.artist}
                </span>
                <span className={styles.playedPoints}>{played.points}</span>
              </li>
            ))}
          </ol>
          <button className={`${styles.primary} ${styles.wide}`} onClick={handleStart}>
            Play again
          </button>
          {/* Back to the start screen: mode, genre and decade stay as chosen, so they are preselected. */}
          <button className={styles.secondary} onClick={() => dispatch({ type: "reset" })}>
            Change settings
          </button>
        </section>
      )}

      {state.screen === "error" && (
        <section className={styles.center} role="alert">
          <p className={styles.errorBox}>
            <CrossIcon className={styles.inlineIcon} />
            {state.message}
          </p>
          <button className={`${styles.primary} ${styles.wide}`} onClick={handleStart}>
            Try again
          </button>
        </section>
      )}
    </div>
  );
}

const OUTCOME_WORD = { correct: "Right", wrong: "Wrong", skipped: "Skipped", timeout: "Time's up" } as const;

const MODE_LABELS: Record<Mode, string> = { title: "Title", artist: "Artist", year: "Year", mixed: "Mixed" };

// The screens that show the stage (wave circle slot): from loading the first song to the reveal.
const IN_PLAY = [
  "creating",
  "first-clip",
  "get-ready",
  "starting",
  "tap-to-start",
  "clip-loading",
  "round",
  "reveal",
] as const;
type InPlay = Extract<GameState, { screen: (typeof IN_PLAY)[number] }>;
function inPlay(state: GameState): state is InPlay {
  return (IN_PLAY as readonly string[]).includes(state.screen);
}

// "Round 2 / 5" and the total score, which rolls up when points are earned.
function StatusLine({ state }: { state: InPlay }) {
  if (state.screen === "creating" || state.screen === "first-clip" || state.screen === "get-ready") {
    return <div className={styles.status} aria-hidden="true" />;
  }
  const round = state.screen === "round" || state.screen === "reveal" ? state.round.round : state.roundNumber;
  const total =
    state.screen === "round" || state.screen === "reveal" ? state.round.totalRounds : state.previewUrls.length;
  return (
    <div className={styles.status}>
      <span>
        Round {round} / {total}
      </span>
      <span className={styles.score}>
        Score <NumberFlow value={state.score} className={styles.number} />
      </span>
    </div>
  );
}

// The stage: a fixed square in the middle of the round. The wave circle fills it, behind the disc. During a round
// it uses the app's own colours only (no song data, CLAUDE.md rule 5); on reveal it blends into the cover's
// colours. The disc holds the seconds (or 3-2-1).
function Stage({
  analyser,
  colours,
  children,
}: {
  analyser: AnalyserNode | null;
  colours: readonly string[] | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.stage}>
      <WaveCircle analyser={analyser} colours={colours} className={styles.wave} />
      <div className={styles.disc}>{children}</div>
    </div>
  );
}

// What sits inside the disc on each screen.
function StageCentre({
  state,
  now,
  getReadyAt,
  roundStartedAt,
}: {
  state: InPlay;
  now: number;
  getReadyAt: number;
  roundStartedAt: number;
}) {
  if (state.screen === "get-ready") {
    const left = Math.max(1, Math.ceil(GET_READY_SECONDS - (now - getReadyAt) / 1000));
    return <NumberFlow value={left} className={`${styles.number} ${styles.seconds}`} aria-hidden="true" />;
  }
  if (state.screen === "tap-to-start") return <PlayIcon className={styles.discIcon} />;
  if (state.screen === "round") {
    const left = state.pending === null ? secondsLeft(now - roundStartedAt) : null;
    return (
      <div role="timer" aria-label={left === null ? "Answer sent" : `${left} seconds left`}>
        {left === null ? (
          <span className={styles.sending} aria-hidden="true">
            …
          </span>
        ) : (
          <NumberFlow
            value={left}
            className={`${styles.number} ${styles.seconds} ${left <= 5 ? styles.low : ""}`}
            aria-hidden="true"
          />
        )}
      </div>
    );
  }
  if (state.screen === "reveal") {
    const { kind } = verdictOf(state.chosen, state.result.correct);
    return kind === "right" ? (
      <CheckIcon className={`${styles.discIcon} ${styles.discRight}`} />
    ) : (
      <CrossIcon className={`${styles.discIcon} ${styles.discWrong}`} />
    );
  }
  return null;
}

// A thin bar under the stage that empties over the 15 seconds. It shrinks with transform (not width).
function TimeBar({ left }: { left: number | null }) {
  return (
    <div className={styles.timeTrack} aria-hidden="true">
      <div className={styles.timeFill} style={{ transform: `scaleX(${timeLeftFraction(left)})` }} />
    </div>
  );
}

const MARK_LABEL = { none: null, chosen: "Locked in", correct: "Right answer", wrong: "Your answer" } as const;

// One answer button. After the round, the right answer gets a check and the player's own wrong pick a
// cross, each with a word, so the result never depends on colour alone.
function AnswerButton({
  title,
  mark,
  disabled,
  onClick,
}: {
  title: string;
  mark: OptionMark;
  disabled: boolean;
  onClick: () => void;
}) {
  const markClass = { none: "", chosen: styles.chosen, correct: styles.correct, wrong: styles.wrong }[mark];
  return (
    <button className={`${styles.option} ${styles.answer} ${markClass}`} disabled={disabled} onClick={onClick}>
      <span className={styles.answerTitle}>{title}</span>
      {mark !== "none" && (
        <span className={styles.mark}>
          {mark === "correct" && <CheckIcon />}
          {mark === "wrong" && <CrossIcon />}
          {MARK_LABEL[mark]}
        </span>
      )}
    </button>
  );
}

function RevealPanel({ state, onNext }: { state: Reveal; onNext: () => void }) {
  const { result, chosen } = state;
  const isLast = state.round.round >= state.round.totalRounds;
  const verdict = verdictOf(chosen, result.correct);

  return (
    <div className={styles.revealPanel} role="status">
      <div className={styles.verdictRow}>
        <p className={styles.verdictText} data-kind={verdict.kind}>
          {verdict.kind === "right" ? (
            <CheckIcon className={styles.verdictIcon} />
          ) : (
            <CrossIcon className={styles.verdictIcon} />
          )}
          {verdict.text}
        </p>
        <p className={styles.earned}>
          <span className={styles.earnedNumber}>+{result.points}</span> points
        </p>
      </div>
      <div className={styles.song}>
        {result.song.artworkUrl && (
          // A plain <img>: the cover comes straight from Apple's servers, no image processing needed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.song.artworkUrl} alt={`Cover of ${result.song.title}`} width={96} height={96} />
        )}
        <div className={styles.songText}>
          <p className={styles.title}>{result.song.title}</p>
          <p className={styles.songMeta}>
            {result.song.artist}
            {result.song.year !== undefined && ` · ${result.song.year}`}
          </p>
          {result.song.storeUrl && (
            <a href={result.song.storeUrl} target="_blank" rel="noopener noreferrer">
              Open in Apple Music
            </a>
          )}
        </div>
      </div>
      <button className={`${styles.primary} ${styles.wide}`} onClick={onNext}>
        {isLast ? "See results" : "Next song"}
      </button>
    </div>
  );
}
