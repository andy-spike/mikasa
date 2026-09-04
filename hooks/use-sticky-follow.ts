"use client";

import { useEffect, type RefObject } from "react";

export function useStickyFollow(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const scroller = el.closest("main");
    if (!scroller) return;

    let last = scroller.scrollTop;
    let top = 0;
    let frame = 0;

    let gap = 0;
    const measureGap = () => {
      const previous = el.style.top;
      el.style.top = "";
      gap = Math.max(
        0,
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop,
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
