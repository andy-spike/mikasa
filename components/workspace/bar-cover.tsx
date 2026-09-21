import { cn } from "@/lib/utils";
import fade from "./scroll-fade.module.css";

/* The lane cover that lets a scroll port's bar fade: engines do not animate
   scrollbar pseudo-elements, so the native thumb is hidden under a cover in
   the port's own ground instead, and `useScrollActivity` fades the cover away
   while the port moves. The width is the lane `::-webkit-scrollbar` reserves
   in globals.css, and the cover must be the port's next sibling. */
export function BarCover({ ground }: { ground: "canvas" | "panel" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 w-2.5",
        ground === "canvas" ? "bg-canvas" : "bg-panel",
        fade.cover,
      )}
    />
  );
}
