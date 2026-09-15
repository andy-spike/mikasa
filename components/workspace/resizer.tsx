"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { Hint } from "@/components/workspace/hint";

type Props = {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  /** Where a double-click, or Home, puts the rail back. */
  defaultWidth: number;
  onResize: (width: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* A drag is direct manipulation, not motion: while the pointer is down the
   root carries `data-resizing`, and globals.css drops every transition under
   it, so the rail, the space it reserves and the rest of the shell track the
   cursor exactly instead of easing along behind it. */
function beginResizing() {
  document.documentElement.dataset.resizing = "true";
}

function endResizing() {
  delete document.documentElement.dataset.resizing;
}

export function Resizer({ side, width, min, max, defaultWidth, onResize }: Props) {
  const { state, isMobile } = useSidebar();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dir = side === "left" ? 1 : -1;
  const label = side === "left" ? "Resize the Outline" : "Resize the Tutor or Tailor";

  useEffect(() => endResizing, []);

  if (isMobile || state === "collapsed") return null;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    drag.current = { x: event.clientX, width };
    beginResizing();
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    onResize(clamp(drag.current.width + ((event.clientX - drag.current.x) / rem) * dir, min, max));
  }

  function reset() {
    onResize(clamp(defaultWidth, min, max));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      reset();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onResize(clamp(width + direction * dir, min, max));
  }

  function endPointerResize(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    endResizing();
    setDragging(false);
    event.currentTarget.blur();
  }

  return (
    <Hint
      side={side === "left" ? "right" : "left"}
      trackCursorAxis="y"
      delay={0}
      disabled={dragging}
      label={
        <dl className="grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-1">
          <dt>Resize</dt>
          <dd className="text-fg-3">Drag</dd>
          <dt>Restore</dt>
          <dd className="flex items-center gap-1.5 text-fg-3">
            Double-click or
            <kbd className="tnum bg-raised px-1.5 py-0.5 font-mono text-[0.6875rem] text-fg-dim">
              Home
            </kbd>
          </dd>
        </dl>
      }
    >
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
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
        className="group/resizer absolute inset-y-0 z-20 w-2 touch-none cursor-col-resize outline-none"
        style={side === "left" ? { right: -4 } : { left: -4 }}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover/resizer:bg-rule group-focus-visible/resizer:bg-fg-3" />
      </div>
    </Hint>
  );
}
