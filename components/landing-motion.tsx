"use client";

import { type ReactNode } from "react";
import { motion, useScroll, useSpring } from "motion/react";

/* Landing scroll motion, powered by Motion. The hero entrance, subject-change
   assembly, and texture drift stay in CSS; this file owns what CSS cannot
   express cleanly: scroll-linked continuity and interruptible arrivals.
   Content renders visible by default and only moves once scripts run, so a
   script failure leaves a readable page. The landing is the project's
   explicit reduced-motion exception, so these play under that preference too. */

/* A neutral reading-progress hairline pinned to the viewport top. It stays
   greyscale so the olive accent remains rationed to wayfinding moments. */
export function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[2px] origin-left bg-fg"
      style={{ scaleX }}
    />
  );
}

/* The exercise band wipes in with a clip the first time it arrives. It also
   remounts on subject change while in view, so a new exercise assembles
   rather than swapping. */
export function ExerciseReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ clipPath: "inset(0 0 100% 0)", y: 24 }}
      whileInView={{ clipPath: "inset(0 0 0% 0)", y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ type: "spring", stiffness: 110, damping: 20 }}
    >
      {children}
    </motion.div>
  );
}

/* The quality terms arrive as the list they are: one short stagger, capped,
   fired once. */
export function QualityList({ children }: { children: ReactNode }) {
  return (
    <motion.dl
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.07 } } }}
    >
      {children}
    </motion.dl>
  );
}

export function QualityItem({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="border-t border-hair py-6 first:border-t-0 first:pt-0"
      variants={{
        hidden: { opacity: 0, y: 16 },
        shown: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 160, damping: 22 } },
      }}
    >
      {children}
    </motion.div>
  );
}
