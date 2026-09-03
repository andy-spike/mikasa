"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTheme } from "@/lib/theme";

/**
 * Two grounds, one switch. The class on <html> is the only state, so this
 * renders the same on the server and the client and needs no mounted flag:
 * which icon shows is a CSS question, not a React one.
 */
export function ThemeToggle() {
  return (
    <Button
      variant="icon"
      aria-label="Switch theme"
      title="Switch theme"
      onClick={() =>
        setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")
      }
    >
      <Sun className="h-4 w-4 dark:hidden" strokeWidth={1.75} />
      <Moon className="hidden h-4 w-4 dark:block" strokeWidth={1.75} />
    </Button>
  );
}
