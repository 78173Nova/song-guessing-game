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
import { canChoose, filterNotes } from "@/lib/client/filter-choices";
import {
  apiAnswer,
  apiNextRound,
  apiReplace,
  apiSoloMatchingSongs,
  apiSongCounts,
  apiStartGame,
} from "@/lib/client/game-api";
import { canPickMode, decadeFromTile, genreFromTile, matchLine, modeNotes, modeProblem } from "@/lib/client/solo-settings";
import { rememberGame } from "@/lib/client/recent-games";
import { gameReducer, initialState, type Answer, type GameState, type RoundInfo } from "@/lib/client/game-state";
import { optionMark, verdictOf, type OptionMark } from "@/lib/client/solo-view";
import { useCoverColours } from "@/lib/client/useCoverColours";
import { useWaveAudio } from "@/lib/client/useWaveAudio";
import { DECADES, type Decade, type SongCount } from "@/lib/game/filters";
import { GENRE_LABELS, GENRES, type Genre } from "@/lib/game/genres";
import { MODES, QUESTION_LABELS, type Mode } from "@/lib/game/modes";
import { ROUNDS_PER_GAME, type MatchingCounts } from "@/lib/game/rounds";
import CheckIcon from "./icons/CheckIcon";
import CrossIcon from "./icons/CrossIcon";
import PlayIcon from "./icons/PlayIcon";
import { showError } from "./messages";
import GameStage from "./GameStage";
import shared from "./GameShared.module.css";
import styles from "./SoloGame.module.css";
import TileGroup from "./TileGroup";
import TimeBar from "./TimeBar";

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
  // waveAnalyser: the analyser once a clip is routed through it; null = the circle idles.
  const wave = useWaveAudio();
  const waveAnalyser = wave.analyser;
  const attachWave = wave.attach;
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
  // Playable songs per genre and decade, so choices with too few songs are greyed out (spec 003, "filter gaps").
  // null until loaded, or if loading failed: then nothing is greyed out and the server still checks the start.
  const [songCounts, setSongCounts] = useState<SongCount[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiSongCounts().then((counts) => {
      if (!cancelled) setSongCounts(counts);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Songs, different titles and different artists for the chosen genre + decade (team feedback 18 Nov, point 7),
  // asked again on every change; a late reply for an older choice is ignored. null until loaded, or if loading
  // failed: then no mode is greyed out and the server still checks the start.
  const [matching, setMatching] = useState<MatchingCounts | null>(null);
  useEffect(() => {
    let current = true;
    apiSoloMatchingSongs({ genre, decade }).then((counts) => {
      if (current) setMatching(counts);
    });
    return () => {
      current = false;
    };
  }, [genre, decade]);
  // The line above "Start game", and why the chosen mode cannot start (it stays chosen, greyed out).
  const line = matchLine(matching);
  const problem = modeProblem(matching, mode);

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
    wave.detachAll();
    wave.unlock();
    // Still inside the tap: create and unlock one player per round.
    const players = Array.from({ length: ROUNDS_PER_GAME }, (_, index) => {
      const player = new Audio();
      player.preload = "auto";
      player.addEventListener("error", () => handlePlayerError(player, index));
      wave.prepare(player); // before the first src, or the analyser reads only silence
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
    wave.resume();
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
      attachWave(player);
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
  }, [startingKey, sendAnswer, attachWave]);

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

  // No music on the start, results and error screens, or after leaving the page (useWaveAudio closes the sound
  // context itself).
  useEffect(() => {
    if (state.screen === "start" || state.screen === "results" || state.screen === "error") pauseAll();
  }, [state.screen]);
  useEffect(() => () => pauseAll(), []);

  // What the current round asks. The server sends it with each round; without it (older data),
  // title/artist/year games fall back to the chosen mode and mixed games show no question.
  const questionType =
    state.screen === "round" || state.screen === "reveal"
      ? (state.round.questionType ?? (mode === "mixed" ? undefined : mode))
      : undefined;

  // The album cover's colours for the wave circle, only once the answer is revealed (CLAUDE.md rule 5).
  // Outside the reveal this is undefined, so the circle goes back to the app colours before the next round.
  const coverColours = useCoverColours(state.screen === "reveal" ? state.result.song.artworkUrl : null);

  // Errors not tied to one form field (the server refused the start, the server or network failed, a clip would not
  // load) show as short messages, the same as everywhere else (#62, user story 26). The button that recovers stays
  // in the page: "Start game" on the start screen, "Try again" on the error screen.
  const errorMessage =
    state.screen === "error" ? state.message : state.screen === "start" ? (state.message ?? null) : null;
  useEffect(() => {
    if (errorMessage !== null) showError(errorMessage);
  }, [errorMessage]);

  return (
    <div className={shared.game}>
      {state.screen === "start" && (
        <section className={shared.center}>
          <p className={shared.intro}>
            Hear a 30-second clip and pick the right answer. {ROUNDS_PER_GAME} rounds – faster answers score more.
          </p>
          {/* Mode, genre and decade as tile rows (team feedback 18 Nov, point 8); choices with too few songs are
              greyed out with a note saying why (point 7). */}
          <div className={styles.settings}>
            <TileGroup
              legend="What do you want to guess?"
              options={MODES.map((m) => ({ value: m, label: MODE_LABELS[m], disabled: !canPickMode(matching, m) }))}
              selected={(value) => value === mode}
              onTap={(value) => setMode(MODES.find((m) => m === value) ?? "title")}
              notes={modeNotes(matching)}
            />
            <TileGroup
              legend="Genre"
              options={[
                { value: "any", label: "Any" },
                ...GENRES.map((g) => ({ value: g, label: GENRE_LABELS[g], disabled: !canChoose(songCounts, { genre: g, decade }) })),
              ]}
              selected={(value) => value === (genre ?? "any")}
              onTap={(value) => setGenre(genreFromTile(value))}
            />
            <TileGroup
              legend="Decade"
              options={[
                { value: "any", label: "Any" },
                ...DECADES.map((d) => ({ value: String(d), label: `${d}s`, disabled: !canChoose(songCounts, { genre, decade: d }) })),
              ]}
              selected={(value) => value === String(decade ?? "any")}
              onTap={(value) => setDecade(decadeFromTile(value))}
              notes={filterNotes(songCounts, { genre, decade })}
            />
          </div>
          {/* How many songs match, and why the chosen mode cannot start: these belong to the settings above, so they
              stay in the page like a field error. A refused start or a server error shows as a short message
              (showError above). */}
          <p className={line.tooFew ? styles.filterProblem : styles.filterNote} role="status">
            {line.text}
          </p>
          {problem && (
            <p className={styles.filterProblem} role="status">
              {problem}
            </p>
          )}
          <button
            className={`${shared.primary} ${shared.wide}`}
            onClick={handleStart}
            disabled={line.tooFew || problem !== null}
          >
            Start game
          </button>
        </section>
      )}

      {/* Every screen from loading to the reveal shares one frame: status line, the stage (where the wave
          circle sits) and what belongs under it. The stage stays in place, so the screens follow each
          other calmly instead of jumping. */}
      {inPlay(state) && (
        <section className={shared.play}>
          <StatusLine state={state} />
          {/* The circle follows the music only while a clip plays (round and reveal); otherwise it idles. */}
          <GameStage
            analyser={state.screen === "round" || state.screen === "reveal" ? waveAnalyser : null}
            colours={coverColours}
          >
            <StageCentre state={state} now={now} getReadyAt={getReadyAt} roundStartedAt={roundStartedAt} />
          </GameStage>

          {(state.screen === "creating" || state.screen === "first-clip") && (
            <p className={shared.message} role="status">
              Loading first song…
            </p>
          )}

          {state.screen === "get-ready" && (
            <p className={shared.message} role="status">
              Get ready!
            </p>
          )}

          {state.screen === "starting" && (
            <p className={shared.message} role="status">
              Round {state.roundNumber}…
            </p>
          )}

          {state.screen === "clip-loading" && (
            <p className={shared.message} role="status">
              Loading next song…
            </p>
          )}

          {state.screen === "tap-to-start" && (
            <div className={shared.message}>
              <p>Your browser needs one more tap to play the sound.</p>
              <button className={`${shared.primary} ${shared.wide}`} onClick={handleTapToStart}>
                <PlayIcon className={shared.inlineIcon} />
                Tap to start
              </button>
            </div>
          )}

          {state.screen === "round" && (
            <TimeBar
              left={state.pending === null ? ROUND_SECONDS - (now - roundStartedAt) / 1000 : null}
              className={styles.timeBar}
            />
          )}

          {state.screen === "reveal" && <RevealPanel state={state} onNext={handleNext} />}

          {/* The server says what each round asks – in mixed games it changes from round to round. */}
          {state.screen === "round" && questionType && (
            <h2 className={shared.question}>{QUESTION_LABELS[questionType]}</h2>
          )}

          {(state.screen === "round" || state.screen === "reveal") && (
            <div className={state.screen === "reveal" ? `${shared.options} ${shared.settled}` : shared.options}>
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
        <section className={shared.center}>
          <h2 className={styles.finalHeading}>
            Your score
            <span className={styles.finalScore}>{state.score}</span>
          </h2>
          <ol className={`${styles.results} ${styles.soloResults}`}>
            {state.history.map((played) => (
              <li key={played.round}>
                <span className={styles.outcome} data-outcome={played.outcome}>
                  {played.outcome === "correct" ? (
                    <CheckIcon className={shared.inlineIcon} />
                  ) : (
                    <CrossIcon className={shared.inlineIcon} />
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
          <button className={`${shared.primary} ${shared.wide}`} onClick={handleStart}>
            Play again
          </button>
          {/* Back to the start screen: mode, genre and decade stay as chosen, so they are preselected. */}
          <button className={shared.secondary} onClick={() => dispatch({ type: "reset" })}>
            Change settings
          </button>
        </section>
      )}

      {/* The error itself shows as a short message (showError above); the page keeps the button that recovers. */}
      {state.screen === "error" && (
        <section className={shared.center}>
          <p className={shared.intro}>The game stopped.</p>
          <button className={`${shared.primary} ${shared.wide}`} onClick={handleStart}>
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
  if (state.screen === "tap-to-start") return <PlayIcon className={shared.discIcon} />;
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
      <CheckIcon className={`${shared.discIcon} ${shared.discRight}`} />
    ) : (
      <CrossIcon className={`${shared.discIcon} ${shared.discWrong}`} />
    );
  }
  return null;
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
  const markClass = { none: "", chosen: shared.chosen, correct: shared.correct, wrong: shared.wrong }[mark];
  return (
    <button className={`${shared.option} ${markClass}`} disabled={disabled} onClick={onClick}>
      <span className={shared.answerTitle}>{title}</span>
      {mark !== "none" && (
        <span className={shared.mark}>
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
      <div className={shared.verdictRow}>
        <p className={shared.verdictText} data-kind={verdict.kind}>
          {verdict.kind === "right" ? (
            <CheckIcon className={shared.verdictIcon} />
          ) : (
            <CrossIcon className={shared.verdictIcon} />
          )}
          {verdict.text}
        </p>
        <p className={shared.earned}>
          <span className={shared.earnedNumber}>+{result.points}</span> points
        </p>
      </div>
      <div className={shared.song}>
        {result.song.artworkUrl && (
          // A plain <img>: the cover comes straight from Apple's servers, no image processing needed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.song.artworkUrl}
            alt={`Cover of ${result.song.title}`}
            width={96}
            height={96}
            // A cover that fails to load is left out, instead of a broken-image icon.
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
        <div className={shared.songText}>
          <p className={shared.title}>{result.song.title}</p>
          <p className={shared.songMeta}>
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
      <button className={`${shared.primary} ${shared.wide}`} onClick={onNext}>
        {isLast ? "See results" : "Next song"}
      </button>
    </div>
  );
}
