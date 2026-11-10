"use client";

// The solo game screens. This file only shows things, plays the clips and reports clicks:
// - which screen comes next is decided by gameReducer (lib/client/game-state.ts)
// - loading, retrying and swapping clips is decided by prepareClip (lib/client/clip-loader.ts)
// - the server calls are in lib/client/game-api.ts
// - the server checks every answer; the browser never knows the correct answer before answering
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  canPlayPreviews,
  prepareClip,
  UNSUPPORTED_BROWSER_MESSAGE,
  withTimeout,
} from "@/lib/client/clip-loader";
import { ROUND_SECONDS, secondsLeft } from "@/lib/client/countdown";
import { apiAnswer, apiNextRound, apiReplace, apiStartGame } from "@/lib/client/game-api";
import { gameReducer, initialState, type Answer, type GameState, type RoundInfo } from "@/lib/client/game-state";
import { ROUNDS_PER_GAME } from "@/lib/game/rounds";
import styles from "./SoloGame.module.css";

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
  // "gameId:round" an answer was already sent for – stops a click and the timer both sending one.
  const answeredRef = useRef<string | null>(null);
  // "gameId:round" whose start was already requested – stops a round being requested twice.
  const startedRef = useRef<string | null>(null);
  // The round the server already sent, kept while waiting for a "Tap to start".
  const loadedRoundRef = useRef<{ key: string; round: RoundInfo } | null>(null);
  const [getReadyAt, setGetReadyAt] = useState(0);
  const [roundStartedAt, setRoundStartedAt] = useState(0);
  const [now, setNow] = useState(0);

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
    // Still inside the tap: create and unlock one player per round.
    const players = Array.from({ length: ROUNDS_PER_GAME }, (_, index) => {
      const player = new Audio();
      player.preload = "auto";
      player.addEventListener("error", () => handlePlayerError(player, index));
      player.src = SILENT_SOUND;
      player.play().catch(() => {});
      return player;
    });
    playersRef.current = players;
    answeredRef.current = null;
    startedRef.current = null;

    dispatch({ type: "start" });
    const game = await apiStartGame();
    if (!game.ok) {
      dispatch({ type: "failed", message: game.message });
      return;
    }
    const { gameId, previewUrls } = game.data;
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
  useEffect(() => () => pauseAll(), []);

  return (
    <div className={styles.game}>
      {state.screen === "start" && (
        <section className={styles.center}>
          <p className={styles.intro}>
            Hear a 30-second clip and pick the right song title. {ROUNDS_PER_GAME} rounds – faster answers score more.
          </p>
          <button className={styles.primary} onClick={handleStart}>
            Start game
          </button>
        </section>
      )}

      {(state.screen === "creating" || state.screen === "first-clip") && (
        <p className={styles.center} role="status">
          Loading first song…
        </p>
      )}

      {state.screen === "get-ready" && (
        <section className={styles.center} role="status">
          <p className={styles.intro}>Get ready!</p>
          <p className={styles.bigNumber}>
            {Math.max(1, Math.ceil(GET_READY_SECONDS - (now - getReadyAt) / 1000))}
          </p>
        </section>
      )}

      {state.screen === "starting" && (
        <p className={styles.center} role="status">
          Round {state.roundNumber}…
        </p>
      )}

      {state.screen === "clip-loading" && (
        <p className={styles.center} role="status">
          Loading next song…
        </p>
      )}

      {state.screen === "tap-to-start" && (
        <section className={styles.center}>
          <button className={styles.primary} onClick={handleTapToStart}>
            ▶ Tap to start
          </button>
        </section>
      )}

      {(state.screen === "round" || state.screen === "reveal") && (
        <section>
          <div className={styles.status}>
            <span>
              Round {state.round.round} / {state.round.totalRounds}
            </span>
            <span>Score {state.score}</span>
          </div>

          {state.screen === "round" && (
            <Countdown left={state.pending === null ? secondsLeft(now - roundStartedAt) : null} />
          )}

          <div className={styles.options}>
            {state.round.options.map((title, index) => (
              <button
                key={index}
                className={optionClass(state, index)}
                disabled={state.screen !== "round" || state.pending !== null}
                onClick={() => state.screen === "round" && sendAnswer(state.gameId, state.round.round, index)}
              >
                {title}
              </button>
            ))}
          </div>

          {state.screen === "reveal" && <RevealPanel state={state} onNext={handleNext} />}
        </section>
      )}

      {state.screen === "results" && (
        <section className={styles.center}>
          <h2>Your score: {state.score}</h2>
          <ol className={styles.results}>
            {state.history.map((played) => (
              <li key={played.round}>
                <span>
                  {OUTCOME_ICON[played.outcome]} {played.title} – {played.artist}
                </span>
                <span>{played.points}</span>
              </li>
            ))}
          </ol>
          <button className={styles.primary} onClick={handleStart}>
            Play again
          </button>
        </section>
      )}

      {state.screen === "error" && (
        <section className={styles.center} role="alert">
          <p className={styles.error}>{state.message}</p>
          <button className={styles.primary} onClick={handleStart}>
            Try again
          </button>
        </section>
      )}
    </div>
  );
}

const OUTCOME_ICON = { correct: "✅", wrong: "❌", skipped: "⏭", timeout: "⏱" } as const;

function optionClass(state: GameState, index: number): string {
  if (state.screen !== "reveal") return styles.option;
  if (index === state.result.correctOption) return `${styles.option} ${styles.correct}`;
  if (index === state.chosen) return `${styles.option} ${styles.wrong}`;
  return styles.option;
}

function Countdown({ left }: { left: number | null }) {
  const shown = left ?? 0;
  return (
    <div className={styles.countdown} aria-label={`${shown} seconds left`}>
      <div className={styles.bar} style={{ width: `${(shown / ROUND_SECONDS) * 100}%` }} />
      <span>{left === null ? "…" : `${shown} s`}</span>
    </div>
  );
}

function RevealPanel({ state, onNext }: { state: Reveal; onNext: () => void }) {
  const { result, chosen } = state;
  const isLast = state.round.round >= state.round.totalRounds;
  let verdict = result.correct ? "✅ Right!" : "❌ Wrong";
  if (chosen === "timeout") verdict = "⏱ Time's up!";
  if (chosen === "skip") verdict = "The preview could not be played – this round was skipped (0 points).";

  return (
    <div className={styles.reveal} role="status">
      <p className={styles.verdict}>{verdict}</p>
      <div className={styles.song}>
        {result.song.artworkUrl && (
          // A plain <img>: the cover comes straight from Apple's servers, no image processing needed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.song.artworkUrl} alt={`Cover of ${result.song.title}`} width={96} height={96} />
        )}
        <div>
          <p className={styles.title}>{result.song.title}</p>
          <p>{result.song.artist}</p>
          {result.song.storeUrl && (
            <a href={result.song.storeUrl} target="_blank" rel="noopener noreferrer">
              Open in Apple Music
            </a>
          )}
        </div>
      </div>
      <p className={styles.points}>+{result.points} points</p>
      <button className={styles.primary} onClick={onNext}>
        {isLast ? "See results" : "Next"}
      </button>
    </div>
  );
}
