// "system" is the absence of a stored choice, which the class alone cannot express.
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
    return "system";
  }
}

export function serverTheme(): ThemeChoice {
  return "system";
}

export function setTheme(next: ThemeChoice) {
  try {
    if (next === "system") localStorage.removeItem("mk-theme");
    else localStorage.setItem("mk-theme", next);
  } catch {}
  const dark =
    next === "dark" || (next === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  for (const notify of listeners) notify();
}
