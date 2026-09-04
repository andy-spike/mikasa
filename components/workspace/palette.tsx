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
  hint?: string;
  group: string;
  run: () => void;
};

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
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
      className="top-[12vh] left-1/2 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 translate-y-0 gap-0 bg-float p-0 sm:max-w-[34rem]"
    >
      <Command
        loop
        filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
      >
        <CommandInput placeholder="Go to a Lesson, or run an action" />

        <CommandList className="max-h-[46vh]">
          <CommandEmpty>Nothing matches that.</CommandEmpty>

          {groups.map((group) => (
            <CommandGroup key={group.name} heading={group.name}>
              {group.items.map((c) => (
                <CommandItem
                  key={c.id}
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
