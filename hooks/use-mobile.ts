import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/* Subscribed rather than set from an effect: the width is external state, so
   React reads it where it lives instead of copying it into a render. */
export function useMediaQuery(query: string, serverValue = false) {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function useIsMobile() {
  return useMediaQuery(QUERY);
}
