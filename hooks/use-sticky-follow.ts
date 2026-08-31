"use client";

import { useEffect, type RefObject } from "react";

/**
 * A column taller than the viewport that follows the scroll instead of
 * pinning half of itself out of reach.
 *
 * `position: sticky` can hold a tall element by its top or by its bottom,
 * never both: `top: 0` makes its own bottom unreachable, and a negative top
 * makes its head unreachable once you are past it. So the sticky `top` moves
 * with the scroll and clamps at each end — scroll down and the column rides
 * up until its last row sits on the viewport floor, then stops; scroll up
 * and it rides back down until its first row meets the header, then stops.
 * The reading column keeps scrolling underneath either way.
 *
 * No-ops while the element is not sticky (below `lg`, where the column is
 * stacked under the Outline) and while it already fits.
 */
export function useStickyFollow(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* The page scrolls inside the shell's <main>, not the window. */
    const scroller = el.closest("main");
    if (!scroller) return;

    let last = scroller.scrollTop;
    let top = 0;
    let frame = 0;

    /* How far below the scrollport the column starts. Sticky measures from
       the element's own flow position, so this head start has to come out of
       the lower bound or the last row settles under the fold. Measured once,
       from the top of the page, and again on resize. */
    let gap = 0;
    const measureGap = () => {
      const previous = el.style.top;
      el.style.top = "";
      gap = Math.max(
        0,
        el.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop,
      );
      el.style.top = previous;
    };

    const apply = () => {
      frame = 0;
      if (getComputedStyle(el).position !== "sticky") {
        el.style.top = "";
        return;
      }
      const viewport = scroller.clientHeight;
      const height = el.offsetHeight;
      const scrolled = scroller.scrollTop;
      const delta = scrolled - last;
      last = scrolled;

      if (height + gap <= viewport) {
        top = 0;
        el.style.top = "0px";
        return;
      }
      /* Between "last row on the floor" and "first row under the header". */
      top = Math.max(viewport - height - gap, Math.min(0, top - delta));
      el.style.top = `${top}px`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    const onResize = () => {
      measureGap();
      onScroll();
    };

    measureGap();
    apply();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [ref]);
}
