"use client";

import { useSyncExternalStore } from "react";

/* Motion's own useReducedMotion captures the media value before its listener
   is initialized in Next's SSR path, so it can return null on first paint.
   This reads the query on the client and follows changes. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
