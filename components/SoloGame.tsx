"use client";

// The solo game screens. This file only shows things and reports clicks:
// - what happens on each click is decided by gameReducer (lib/client/game-state.ts)
// - the server calls are in lib/client/game-api.ts
// - the server checks every answer; the browser never knows the correct answer before answering
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { secondsLeft, ROUND_SECONDS } from "@/lib/client/countdown";
import { apiAnswer, apiNextRound, apiStartGame } from "@/lib/client/game-api";
import { gameReducer, initialState, type Answer, type GameState } from "@/lib/client/game-state";
import { ROUNDS_PER_GAME } from "@/lib/game/rounds";
import styles from "./SoloGame.module.css";

// A tiny silent sound. Playing it during a tap "unlocks" the audio player on phones,
// so the clip may start automatically once the round has loaded.
const SILENT_SOUND = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export default function SoloGame() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Which round an answer was already sent for ("gameId:round") – stops a click and the timer both sending one.
  const answeredRef = useRef<string | null>(null);
  const [roundStartedAt, setRoundStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);

  const roundKey = state.screen === "round" ? `${state.gameId}:${state.round.round}` : null;
  const previewUrl = state.screen === "round" ? state.round.previewUrl : null;
  const pending = state.screen === "round" ? state.pending : null;

  function unlockAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = SILENT_SOUND;
    audio.play().catch(() => {});
  }

  async function loadRound(gameId: string) {
    const next = await apiNextRound(gameId);
    if (!next.ok) {
      dispatch({ type: "failed", message: next.message });
      return;
    }
    setNeedsTap(false);
    setRoundStartedAt(Date.now());
    setNow(Date.now());
    dispatch({ type: "round-loaded", gameId, round: next.data });
  }

  async function handleStart() {
    unlockAudio();
    dispatch({ type: "start" });
    const game = await apiStartGame();
    if (!game.ok) {
      dispatch({ type: "failed", message: game.message });
      return;
    }
    await loadRound(game.data.gameId);
  }

  function handleNext(current: Extract<GameState, { screen: "reveal" }>) {
    const isLast = current.round.round >= current.round.totalRounds;
    if (isLast) audioRef.current?.pause();
    else unlockAudio();
    dispatch({ type: "next" });
    if (!isLast) loadRound(current.gameId);
  }

  const sendAnswer = useCallback(async (gameId: string, round: number, answer: Answer) => {
    const key = `${gameId}:${round}`;
    if (answeredRef.current === key) return;
    answeredRef.current = key;
    dispatch({ type: "answer", answer });
    const result = await apiAnswer(gameId, round, answer);
    dispatch(result.ok ? { type: "answer-result", result: result.data } : { type: "failed", message: result.message });
  }, []);

  // A new round: play its clip.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || previewUrl === null) return;
    audio.src = previewUrl;
    audio.play().catch((error: unknown) => {
      // The browser refused to start the sound on its own → show a Play button (not a failed preview).
      if (error instanceof DOMException && error.name === "NotAllowedError") setNeedsTap(true);
    });
  }, [roundKey, previewUrl]);

  // The countdown: ticks while the round is open, and sends "timeout" when it reaches 0.
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

  // No music on the start, results and error screens.
  useEffect(() => {
    if (state.screen === "start" || state.screen === "results" || state.screen === "error") {
      audioRef.current?.pause();
    }
  }, [state.screen]);

  // The clip itself failed to load → skip the round (0 points), the song is still revealed.
  function handleAudioError(event: React.SyntheticEvent<HTMLAudioElement>) {
    if (state.screen !== "round" || state.pending !== null) return;
    if (event.currentTarget.src !== state.round.previewUrl) return;
    sendAnswer(state.gameId, state.round.round, "skip");
  }

  function playByTap() {
    audioRef.current
      ?.play()
      .then(() => setNeedsTap(false))
      .catch(() => {});
  }

  return (
    <div className={styles.game}>
      <audio ref={audioRef} onError={handleAudioError} preload="auto" />

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

      {state.screen === "loading" && (
        <p className={styles.center} role="status">
          Loading…
        </p>
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

          {state.screen === "round" && needsTap && (
            <button className={styles.secondary} onClick={playByTap}>
              ▶ Play clip
            </button>
          )}

          <div className={styles.options}>
            {state.round.options.map((title, index) => (
              <button
                key={index}
                className={optionClass(state, index)}
                disabled={state.screen !== "round" || state.pending !== null}
                onClick={() =>
                  state.screen === "round" && sendAnswer(state.gameId, state.round.round, index)
                }
              >
                {title}
              </button>
            ))}
          </div>

          {state.screen === "reveal" && <Reveal state={state} onNext={() => handleNext(state)} />}
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

function Reveal({ state, onNext }: { state: Extract<GameState, { screen: "reveal" }>; onNext: () => void }) {
  const { result, chosen } = state;
  const isLast = state.round.round >= state.round.totalRounds;
  let verdict = result.correct ? "✅ Right!" : "❌ Wrong";
  if (chosen === "timeout") verdict = "⏱ Time's up!";
  if (chosen === "skip") verdict = "The preview could not be loaded – this round was skipped (0 points).";

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
