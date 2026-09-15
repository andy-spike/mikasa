"use client";

import { useEffect, type RefObject } from "react";

/* How long a port stays awake after its last scroll event. */
const LINGER = 1600;

/**
 * Marks a scroll port while it is moving, so its bar can ride with the scroll
 * and sleep once the port has been still a beat. Engines cannot animate
 * scrollbar pseudo-elements, so the bar itself cannot fade; the port hides it
 * under a cover in its own ground (`scroll-fade.module.css`) and this is what
 * tells the cover to fade away. The attribute is written straight to the
 * element: this is a state of the scroll, not of React.
 *
 * The listener hangs on `document` instead of on the port, because the port is
 * not the same element for the life of the hook: the same rail is rendered in
 * the desktop sidebar and again inside the mobile Sheet, and switching between
 * them swaps the element under the ref while the effect holds. Scroll events
 * do not bubble, but they do reach a capture listener, so one listener can
 * follow whatever element the ref holds now.
 */
export function useScrollActivity<T extends HTMLElement>(ref: RefObject<T | null>): void {
  useEffect(() => {
    let timer: number | null = null;
    let marked: T | null = null;

    const sleep = () => {
      if (marked) delete marked.dataset.scrolling;
      timer = null;
    };
    const wake = (event: Event) => {
      const el = ref.current;
      if (!el || event.target !== el) return;
      marked = el;
      el.dataset.scrolling = "";
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(sleep, LINGER);
    };

    document.addEventListener("scroll", wake, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", wake, true);
      if (timer !== null) window.clearTimeout(timer);
      if (marked) delete marked.dataset.scrolling;
    };
  }, [ref]);
}
