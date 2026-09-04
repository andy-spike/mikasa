"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTheme } from "@/lib/theme";

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
