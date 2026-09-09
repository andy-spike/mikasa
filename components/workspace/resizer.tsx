"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useSidebar } from "@/components/ui/sidebar";

type Props = {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function Resizer({ side, width, min, max, onResize }: Props) {
  const { state, isMobile } = useSidebar();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const dir = side === "left" ? 1 : -1;
  const label = side === "left" ? "Resize the Outline" : "Resize the Tutor or Tailor";

  if (isMobile || state === "collapsed") return null;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    drag.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    onResize(clamp(drag.current.width + ((event.clientX - drag.current.x) / rem) * dir, min, max));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onResize(clamp(width + direction * dir, min, max));
  }

  function endPointerResize(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    event.currentTarget.blur();
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointerResize}
      onLostPointerCapture={endPointerResize}
      onKeyDown={onKeyDown}
      className="group/resizer absolute inset-y-0 z-20 w-2 touch-none cursor-col-resize outline-none"
      style={side === "left" ? { right: -4 } : { left: -4 }}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover/resizer:bg-rule group-focus-visible/resizer:bg-fg-3" />
    </div>
  );
}
