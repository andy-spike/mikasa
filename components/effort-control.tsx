"use client";

import { useState } from "react";
import { Slider } from "@base-ui/react/slider";
import { ChevronDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/workspace/hint";
import { cn } from "@/lib/utils";
import type { ReasoningEffort } from "@/lib/model";

export const EFFORTS = ["low", "medium", "high"] as const satisfies readonly ReasoningEffort[];

/* How hard the model thinks before it answers. A quiet control beside the
   composer, because the right setting is a property of the question, not of
   the surface the question is asked from. */
export function EffortControl({
  effort,
  onEffort,
  className,
}: {
  effort: ReasoningEffort;
  onEffort: (effort: ReasoningEffort) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Hint label="Gemini 3.7 Flash reasoning effort">
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="quiet"
              aria-label={`Reasoning effort: ${effort}`}
              className={cn("-ml-1 h-8 gap-1.5 px-1 text-[0.75rem] capitalize", className)}
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />
              {effort}
              <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
            </Button>
          }
        />
      </Hint>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-60 p-3"
        onKeyDown={(event) => {
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
          )
            event.stopPropagation();
        }}
      >
        <div className="flex items-center gap-2 text-[0.8125rem] text-fg">
          <Zap className="h-3.5 w-3.5 text-fg-3" strokeWidth={1.75} />
          <span className="font-medium">Gemini 3.7 Flash</span>
          <span className="ml-auto capitalize text-fg-3">{effort}</span>
        </div>
        <Slider.Root
          value={EFFORTS.indexOf(effort)}
          min={0}
          max={2}
          step={1}
          onValueChange={(value) => onEffort(EFFORTS[value])}
          onValueCommitted={() => setOpen(false)}
          className="mt-4"
        >
          <Slider.Control className="relative mx-2.5 flex h-6 touch-none items-center">
            <Slider.Track className="relative h-1.5 w-full overflow-hidden bg-raised">
              <Slider.Indicator className="h-full bg-fg-3" />
            </Slider.Track>
            {EFFORTS.map((value, index) => (
              <span
                key={value}
                className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 bg-panel ring-1 ring-fg-3"
                style={{ left: `${index * 50}%` }}
              />
            ))}
            <Slider.Thumb
              getAriaLabel={() => "Reasoning effort"}
              getAriaValueText={(_, value) => EFFORTS[value]}
              className="h-5 w-5 bg-fg outline-none ring-canvas focus-visible:ring-2"
            />
          </Slider.Control>
        </Slider.Root>
        <div className="mt-1 flex justify-between text-[0.6875rem] capitalize text-fg-dim">
          {EFFORTS.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
