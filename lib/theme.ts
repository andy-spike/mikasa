// "system" is the absence of a stored choice, which the class alone cannot express.
export type ThemeChoice = "system" | "light" | "dark";

const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const syncSystem = () => {
    if (readTheme() === "system") {
      document.documentElement.classList.toggle("dark", media.matches);
    }
    onChange();
  };
  listeners.add(onChange);
  media.addEventListener("change", syncSystem);
  window.addEventListener("storage", syncSystem);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", syncSystem);
    window.removeEventListener("storage", syncSystem);
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
