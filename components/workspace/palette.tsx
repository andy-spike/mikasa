"use client";

import { useMemo } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type Command = {
  id: string;
  label: string;
  /** shown right of the label: the Module a Lesson sits in. Never a gloss. */
  hint?: string;
  group: string;
  run: () => void;
};

/**
 * Navigation, not a shortcut. Every Lesson and every action in the workspace
 * is reachable from here without the pointer.
 *
 * Built on the vendored `Command` (cmdk in a base-ui Dialog), which owns the
 * filtering, the active-option management, arrow keys, Enter, Escape, the
 * focus trap, the inert background and returning focus to whatever opened
 * it. This file owns the surface, the grouping and the footer.
 */
export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  /* Groups in the order they were declared: Actions, then Lessons. */
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, Command[]>();
    for (const c of commands) {
      if (!byGroup.has(c.group)) {
        byGroup.set(c.group, []);
        order.push(c.group);
      }
      byGroup.get(c.group)!.push(c);
    }
    return order.map((name) => ({ name, items: byGroup.get(name)! }));
  }, [commands]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Command palette"
      description="Go to a Lesson, or run an action"
      /* 34rem on the float ground, square, 12vh from the top — the palette
         is the one thing in the product that genuinely floats. */
      className="top-[12vh] left-1/2 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 translate-y-0 gap-0 bg-float p-0 sm:max-w-[34rem]"
    >
      {/* This registry's CommandDialog does not wrap its children in the
          cmdk root, so the root is here. `loop` is the wrap DESIGN.md
          asks the arrow keys for. */}
      <Command
        loop
        /* cmdk scores fuzzily by default, which turns "gaps" into seven
           loose matches. This palette is navigation, not search: a query
           either appears in the entry or the entry is not a result. */
        filter={(value, search) =>
          value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
        }
      >
        <CommandInput placeholder="Go to a Lesson, or run an action" />

        <CommandList className="max-h-[46vh]">
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        {groups.map((group) => (
          <CommandGroup key={group.name} heading={group.name}>
            {group.items.map((c) => (
              <CommandItem
                key={c.id}
                /* What the filter reads, so a Module name still finds its
                   Lessons the way it did before. */
                value={`${c.label} ${c.hint ?? ""} ${c.group}`}
                onSelect={() => {
                  onClose();
                  c.run();
                }}
              >
                <span className="truncate">{c.label}</span>
                {c.hint ? (
                  <span className="ml-auto shrink-0 truncate text-[0.75rem] text-fg-dim">
                    {c.hint}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        </CommandList>

        <div className="flex items-center gap-4 border-t border-hair px-4 py-2.5">
          <Key hint="move">↑</Key>
          <Key hint="open">↵</Key>
          <Key hint="close">esc</Key>
        </div>
      </Command>
    </CommandDialog>
  );
}

function Key({ children, hint }: { children: string; hint: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="tnum bg-raised px-1.5 py-0.5 font-mono text-[0.6875rem] text-fg-dim">
        {children}
      </kbd>
      <span className="text-[0.75rem] text-fg-dim">{hint}</span>
    </span>
  );
}
