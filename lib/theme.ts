/**
 * The ground, held in the DOM rather than in React.
 *
 * The class on <html> is the state — written before first paint in
 * layout.tsx — and localStorage holds the choice behind it. "system" is the
 * absence of a stored choice, which the class alone cannot express, so the
 * settings control reads through here instead of guessing from the class.
 * A tiny subscription keeps the header switch and the settings segments
 * telling the same story.
 */

export type ThemeChoice = "system" | "light" | "dark";

const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem("mk-theme");
    return stored === "dark" || stored === "light" ? stored : "system";
  } catch {
    /* a locked-down browser still gets the switch, just not the memory */
    return "system";
  }
}

/** The server has no localStorage and no OS preference: it renders "system". */
export function serverTheme(): ThemeChoice {
  return "system";
}

export function setTheme(next: ThemeChoice) {
  try {
    if (next === "system") localStorage.removeItem("mk-theme");
    else localStorage.setItem("mk-theme", next);
  } catch {
    /* ignored */
  }
  const dark =
    next === "dark" || (next === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  for (const notify of listeners) notify();
}
