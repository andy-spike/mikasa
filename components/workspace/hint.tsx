"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* The system's one hover hint. A title the row had to truncate, or a control
   that carries only an icon, says what it is in the floating box the selection
   pill wears — the browser's black box never is the answer. The trigger is the
   child itself, so wrapping a control costs a call site no extra element. */
export function Hint({
  label,
  side = "top",
  trackCursorAxis,
  delay,
  disabled,
  children,
}: {
  label: ReactNode;
  side?: ComponentProps<typeof TooltipContent>["side"];
  /** Follow the pointer on one axis — for hints hung off a full-height edge. */
  trackCursorAxis?: ComponentProps<typeof Tooltip>["trackCursorAxis"];
  /** Opens without the provider's rest delay — for a hint the trigger cannot explain itself without. */
  delay?: number;
  /** Mutes the hint and closes it — for a trigger that is being dragged. */
  disabled?: boolean;
  children: ReactElement;
}) {
  return (
    <Tooltip trackCursorAxis={trackCursorAxis} disabled={disabled}>
      <TooltipTrigger render={children} delay={delay} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
