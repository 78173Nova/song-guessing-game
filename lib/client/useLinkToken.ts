"use client";

import { useEffect, useRef } from "react";

// For pages opened from a link in an email (/verify-email?token=…, /reset-password?token=…): reads the token
// from the address bar once, removes it from there (so it does not stay in the history or get shared by
// accident) and hands it to onToken, or null when the link has no token.
// React runs effects twice in development; a link works only once, so onToken runs only once.
// onToken runs just after the effect, not during it, so a state change there does not render the page twice
// in one go.
export function useLinkToken(onToken: (token: string | null) => void): void {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => onToken(token));
  }, [onToken]);
}
