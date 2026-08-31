"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useSidebar } from "@/components/ui/sidebar";

type Props = {
  side: "left" | "right";
  /** current rail width, in rem */
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
};

/* A drag strip on the rail's inner edge. The rail width itself lives in the
   workspace's state; this only turns pointer movement into new values. */
export function Resizer({ side, width, min, max, onResize }: Props) {
  const { state, isMobile } = useSidebar();
  const drag = useRef<{ x: number; start: number } | null>(null);

  /* The collapsed stub is its own affordance, and a sheet cannot be dragged. */
  if (isMobile || state === "collapsed") return null;

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    drag.current = { x: e.clientX, start: width };
    /* Capture keeps the drag alive when the pointer leaves the strip. */
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer has nothing to capture; the handlers still run */
    }
    /* The rails settle with a 200ms animation; mid-drag that reads as lag. */
    document.documentElement.setAttribute("data-resizing", "");
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const delta = ((e.clientX - drag.current.x) / rem) * (side === "left" ? 1 : -1);
    onResize(Math.min(max, Math.max(min, drag.current.start + delta)));
  }

  function end() {
    drag.current = null;
    document.documentElement.removeAttribute("data-resizing");
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "left" ? "Resize the Outline" : "Resize the panel"}
      aria-valuemin={Math.round(min * 16)}
      aria-valuemax={Math.round(max * 16)}
      aria-valuenow={Math.round(width * 16)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onLostPointerCapture={end}
      className="absolute inset-y-0 z-20 w-1.5 touch-none cursor-col-resize transition-colors hover:bg-rule"
      style={side === "left" ? { right: 0 } : { left: 0 }}
    />
  );
}
