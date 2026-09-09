"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readTheme, serverTheme, setTheme, subscribeTheme, type ThemeChoice } from "@/lib/theme";

const THEMES = ["light", "dark", "system"] as const;

function toggleTheme() {
  setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
}

export function ThemeToggle() {
  const [open, setOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        if (!next || details.reason !== "trigger-press") setOpen(next);
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="icon"
            className="h-8 w-8 p-2"
            aria-label="Switch theme. Right-click for theme options"
            title="Switch theme · Right-click for options"
            onClick={toggleTheme}
            onContextMenu={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <Sun className="h-4 w-4 dark:hidden" strokeWidth={1.75} />
            <Moon className="hidden h-4 w-4 dark:block" strokeWidth={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-32 py-1">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeChoice)}
        >
          {THEMES.map((value) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              closeOnClick
              className="py-1.5 text-[0.8125rem] font-normal tracking-normal capitalize"
            >
              {value}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
