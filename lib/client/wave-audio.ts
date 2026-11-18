// Connects the game's audio players to the browser's sound analyser, so the wave circle can follow the music.
// No React here; the game screens call it through useWaveAudio (lib/client/useWaveAudio.ts) at the right moments:
// - unlock(): inside the Start tap (phones only allow sound to start from a tap)
// - prepare(player): right after creating a player, before its first `src`
// - attach(player): when its clip starts
// - analyser(): what WaveCircle reads; null = no music to follow, the circle shows its idle pulse
//
// Safety first: a player is only routed through the analyser when the sound context is already running and the
// player asked for cross-origin access. Otherwise it plays exactly as before (straight to the speakers), and the
// circle simply idles. A routed player can only be heard through the context, so these checks keep the
// sound from going silent.

// fftSize 256 → 128 frequency bands per frame (FREQUENCY_BINS in wave-shape.ts).
const FFT_SIZE = 256;
// How much each frame keeps of the one before (0–1). Higher = calmer movement.
const SMOOTHING = 0.8;

export type WaveAudio = {
  unlock(): void;
  prepare(player: HTMLAudioElement): void;
  attach(player: HTMLAudioElement): boolean;
  detachAll(): void;
  close(): void;
  analyser(): AnalyserNode | null;
};

function browserContext(): AudioContext | null {
  return typeof AudioContext === "undefined" ? null : new AudioContext();
}

export function createWaveAudio(makeContext: () => AudioContext | null = browserContext): WaveAudio {
  let context: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let unavailable = false;
  const sources = new Map<HTMLAudioElement, MediaElementAudioSourceNode>();

  return {
    unlock() {
      if (!context && !unavailable) {
        try {
          context = makeContext();
          if (context) {
            analyserNode = context.createAnalyser();
            analyserNode.fftSize = FFT_SIZE;
            analyserNode.smoothingTimeConstant = SMOOTHING;
            analyserNode.connect(context.destination);
          }
        } catch {
          context = null;
          analyserNode = null;
        }
        if (!context) unavailable = true;
      }
      context?.resume().catch(() => {});
    },

    prepare(player) {
      // Without this the analyser reads only zeros (Apple's clip server allows it, checked 18 Nov 2026).
      if (context) player.crossOrigin = "anonymous";
    },

    attach(player) {
      if (sources.has(player)) return true;
      if (!context || !analyserNode || context.state !== "running") return false;
      if (player.crossOrigin !== "anonymous") return false;
      try {
        // Can be done only once per player; from now on its sound goes through the context.
        const source = context.createMediaElementSource(player);
        source.connect(analyserNode);
        sources.set(player, source);
        return true;
      } catch {
        return false;
      }
    },

    detachAll() {
      for (const source of sources.values()) source.disconnect();
      sources.clear();
    },

    analyser() {
      return sources.size > 0 ? analyserNode : null;
    },

    // When the game screen goes away: stop the sound context so phones do not keep one open per visit.
    close() {
      this.detachAll();
      context?.close().catch(() => {});
      context = null;
      analyserNode = null;
      unavailable = false;
    },
  };
}
