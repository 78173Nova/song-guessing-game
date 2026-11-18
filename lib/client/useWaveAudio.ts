"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWaveAudio, type WaveAudio } from "./wave-audio";

// The wave circle's sound analyser for one game screen (the solo game and the room game use it the same way).
// It wraps createWaveAudio (lib/client/wave-audio.ts) and keeps the analyser in React state:
// - unlock(): inside a tap (Start, Join, …). Creates the sound context the first time; phones allow that only in
//   a tap.
// - resume(): inside a later tap ("Tap to start"). Wakes the sound context if it exists, never creates one.
// - prepare(player): right after creating a player, before its first `src` (does nothing before the first unlock).
// - attach(player): when its clip starts. Routes it through the analyser if that is safe; then `analyser` is set.
// - detachAll(): a new game starts. Lets go of the old players; the circle idles until the next clip.
// - analyser: what WaveCircle reads; null = no music to follow, the circle idles.
// The sound context is closed when the screen goes away.
export function useWaveAudio() {
  const waveAudioRef = useRef<WaveAudio | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const unlock = useCallback(() => {
    (waveAudioRef.current ??= createWaveAudio()).unlock();
  }, []);

  const resume = useCallback(() => {
    waveAudioRef.current?.unlock();
  }, []);

  const prepare = useCallback((player: HTMLAudioElement) => {
    waveAudioRef.current?.prepare(player);
  }, []);

  const attach = useCallback((player: HTMLAudioElement) => {
    const waveAudio = waveAudioRef.current;
    if (waveAudio?.attach(player)) setAnalyser(waveAudio.analyser());
  }, []);

  const detachAll = useCallback(() => {
    waveAudioRef.current?.detachAll();
    setAnalyser(null);
  }, []);

  // No sound context left open after leaving the page (phones would otherwise keep one per visit).
  useEffect(() => () => waveAudioRef.current?.close(), []);

  return { analyser, unlock, resume, prepare, attach, detachAll };
}
