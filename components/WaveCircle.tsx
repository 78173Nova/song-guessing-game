"use client";

// The wave circle: a ring drawn on a canvas that ripples to the clip that is playing (DESIGN.md, "The wave
// circle"). The shape comes from waveOutline and the colours from blendColours (lib/client/wave-shape.ts); this
// file only draws what they return.
//
// - analyser: the sound analyser of the playing clip (lib/client/wave-audio.ts). null = nothing to follow:
//   a slow idle pulse (used on the landing page, while loading, and when sound is blocked).
// - colours: hex colours for the ring. Leave it out for the app's own wave colours (the CSS tokens), which is
//   the only choice while a round is open (CLAUDE.md rule 5). A new list blends in over --duration-wave-colour;
//   leaving it out again blends back over --duration-base.
// - "Reduce motion" on: the ring stays still as a plain circle, and a colour change happens at once.
//
// Performance (animation-performance): the drawing runs on requestAnimationFrame only while the canvas is on
// screen and the tab is visible, never through React state, and stops entirely when nothing moves.
import { useEffect, useRef } from "react";
import { blendColours, idlePulse, waveOutline } from "@/lib/client/wave-shape";
import styles from "./WaveCircle.module.css";

const TOKEN_NAMES = ["--color-wave-blue", "--color-wave-cyan", "--color-wave-violet"];
const STROKE_WIDTH = 3; // CSS pixels; the outline's maximum (48 %) leaves room for it inside the canvas
const FILL_ALPHA = 0.18; // a light wash of the same colours inside the outline

type Props = {
  analyser?: AnalyserNode | null;
  colours?: readonly string[];
  className?: string;
};

export default function WaveCircle({ analyser = null, colours, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The latest props, read by the drawing loop without restarting it.
  const analyserRef = useRef(analyser);
  const coloursRef = useRef(colours);
  const wakeRef = useRef<() => void>(() => {});
  useEffect(() => {
    analyserRef.current = analyser;
    coloursRef.current = colours;
    wakeRef.current();
  }, [analyser, colours]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const darkMode = window.matchMedia("(prefers-color-scheme: dark)");

    let size = 0; // CSS pixels
    let pixelRatio = 1;
    let onScreen = true;
    let frame = 0;
    let appColours = readAppColours(canvas);
    let blendMs = 0;
    // Colour blend: from `from` to `to`, started at `blendStart`. `shown` is what is on screen now.
    let shown = appColours;
    let from = shown;
    let to: readonly string[] = shown;
    let blendStart = -Infinity;
    let blending = false;
    let buffer = new Uint8Array(0);

    function draw(now: number) {
      const target = coloursRef.current && coloursRef.current.length > 0 ? coloursRef.current : appColours;
      if (target.join() !== to.join()) {
        from = shown;
        to = target;
        blendStart = now;
        // Into new colours (the cover's on reveal) over --duration-wave-colour; back to the app colours faster,
        // over --duration-base, so no album colour is left once the next round starts (DESIGN.md, "What moves").
        // Under "reduce motion" both tokens are 0ms (app/globals.css): the colour changes at once. Read at the
        // start of each blend, so a change of that setting counts from the next blend.
        blendMs = readDuration(canvas!, target === appColours ? "--duration-base" : "--duration-wave-colour");
      }
      const progress = blendMs > 0 ? (now - blendStart) / blendMs : 1;
      blending = progress < 1;
      shown = blendColours(from, to, easeInOut(progress));

      let frequencies: Uint8Array | null = null;
      let pulse = 1;
      const playing = analyserRef.current;
      if (!reduceMotion.matches) {
        if (playing) {
          if (buffer.length !== playing.frequencyBinCount) buffer = new Uint8Array(playing.frequencyBinCount);
          playing.getByteFrequencyData(buffer);
          frequencies = buffer;
        } else {
          pulse = idlePulse(now);
        }
      }
      paint(waveOutline(frequencies, size, pulse));
    }

    function paint(points: { x: number; y: number }[]) {
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, size, size);
      if (shown.length === 0 || points.length === 0) return;

      const centre = size / 2;
      const gradient =
        typeof context.createConicGradient === "function"
          ? context.createConicGradient(-Math.PI / 2, centre, centre) // start at the top, like the outline
          : context.createLinearGradient(0, 0, size, size);
      shown.forEach((colour, index) => gradient.addColorStop(index / shown.length, colour));
      gradient.addColorStop(1, shown[0]); // back to the first colour, so the ring has no seam

      // A smooth closed curve through the midpoints between neighbouring points.
      const last = points[points.length - 1];
      context.beginPath();
      context.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2);
      points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      });
      context.closePath();
      context.globalAlpha = FILL_ALPHA;
      context.fillStyle = gradient;
      context.fill();
      context.globalAlpha = 1;
      context.lineWidth = STROKE_WIDTH;
      context.lineJoin = "round";
      context.strokeStyle = gradient;
      context.stroke();
    }

    const canRun = () => onScreen && !document.hidden && size > 0;
    const moving = () => !reduceMotion.matches || blending;

    function loop(now: number) {
      frame = 0;
      draw(now);
      if (canRun() && moving()) frame = requestAnimationFrame(loop);
    }

    // Draws at least one frame (after a resize, a new colour or a setting change) and restarts the loop if
    // something moves.
    function wake() {
      if (frame === 0 && canRun()) frame = requestAnimationFrame(loop);
    }
    wakeRef.current = wake;

    const resize = new ResizeObserver(([entry]) => {
      size = entry.contentRect.width;
      pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * pixelRatio);
      canvas.height = Math.round(size * pixelRatio);
      wake();
    });
    resize.observe(canvas);
    const visible = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      wake();
    });
    visible.observe(canvas);
    const onSchemeChange = () => {
      appColours = readAppColours(canvas);
      wake();
    };
    document.addEventListener("visibilitychange", wake);
    reduceMotion.addEventListener("change", wake);
    darkMode.addEventListener("change", onSchemeChange);

    return () => {
      cancelAnimationFrame(frame);
      wakeRef.current = () => {};
      resize.disconnect();
      visible.disconnect();
      document.removeEventListener("visibilitychange", wake);
      reduceMotion.removeEventListener("change", wake);
      darkMode.removeEventListener("change", onSchemeChange);
    };
  }, []);

  return <canvas ref={canvasRef} className={`${styles.canvas} ${className ?? ""}`} aria-hidden="true" />;
}

// The app's wave colours from the CSS tokens, so dark mode works.
function readAppColours(element: Element): string[] {
  const style = getComputedStyle(element);
  return TOKEN_NAMES.map((name) => style.getPropertyValue(name).trim()).filter((value) => value !== "");
}

// A timing token ("900ms" or "0.9s") in milliseconds; 0 if missing.
function readDuration(element: Element, name: string): number {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  const amount = parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  return value.endsWith("ms") ? amount : amount * 1000;
}

// The same curve as --ease-in-out (slow start, slow end), for the colour blend.
function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
