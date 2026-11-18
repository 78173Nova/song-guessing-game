"use client";

import { useEffect, useState } from "react";
import { pickCoverColours } from "./cover-colours";

// The album cover's colours for the wave circle, once the answer is revealed (DESIGN.md, "The wave circle").
// Pass the revealed song's artworkUrl (or null while no answer is revealed). Returns 2–3 hex colours for
// <WaveCircle colours={…} />, or undefined while the cover loads, when there is no cover, when it fails to load,
// or when it is nearly grey: then the circle keeps the app colours. It never throws.
//
// Only call it with the cover of a song whose answer is already revealed (CLAUDE.md rule 5).
export function useCoverColours(artworkUrl: string | null | undefined): string[] | undefined {
  const [loaded, setLoaded] = useState<{ url: string; colours: string[] | null } | null>(null);

  useEffect(() => {
    if (!artworkUrl) return;
    let current = true;
    loadCoverColours(artworkUrl).then((colours) => {
      if (current) setLoaded({ url: artworkUrl, colours });
    });
    return () => {
      current = false;
    };
  }, [artworkUrl]);

  // Colours from an earlier cover never show for a new one (or after the reveal is over).
  return loaded && loaded.url === artworkUrl && loaded.colours ? loaded.colours : undefined;
}

// The cover is shrunk to this many pixels square before its colours are counted: enough for the main colours,
// and quick to read (1,024 pixels).
const SAMPLE_SIZE = 32;
// A cover that has not loaded by then is skipped; the circle keeps the app colours.
const LOAD_TIMEOUT_MS = 5000;

// Loads the cover as a separate image that asks for cross-origin access (Apple's image server allows it), draws
// it small on a canvas that is never shown, and picks the colours from its pixels. Resolves to null on any
// failure: no browser, load error, timeout, or a server that refuses cross-origin reads (the canvas then
// refuses to give out its pixels).
export function loadCoverColours(url: string): Promise<string[] | null> {
  if (typeof Image === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    function finish(colours: string[] | null) {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(colours);
    }
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return finish(null);
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        finish(pickCoverColours(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data));
      } catch {
        finish(null); // e.g. a SecurityError when the server did not allow cross-origin reads
      }
    };
    image.onerror = () => finish(null);
    image.crossOrigin = "anonymous"; // before src, or the pixels cannot be read
    image.src = url;
  });
}
