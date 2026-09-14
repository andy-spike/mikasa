"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft, X } from "lucide-react";
import { motion } from "motion/react";
import { CancelRunButton } from "@/components/cancel-run-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import { cn } from "@/lib/utils";
import {
  GOAL,
  LESSON_MS,
  LOOP_MS,
  MODULES,
  SOURCE_MS,
  SOURCES,
  T,
  TOPIC,
  TOTAL_LESSONS,
  WHY,
} from "./fixture";

const STEPS = [
  { id: "sources", label: "Sources" },
  { id: "outline", label: "Outline" },
  { id: "specification", label: "Connections" },
  { id: "persist", label: "Saving" },
] as const;

type Frame = {
  stepIndex: number;
  message: string;
  sourcesShown: number;
  lessonsShown: number;
  writing: boolean;
  ready: boolean;
};

const EASE = [0.2, 0, 0, 1] as const;

/* Motion's own useReducedMotion captures the media value before its listener
   is initialized in Next's SSR path, so it can return null on first paint.
   This reads the query on the client and follows changes. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function frameAt(t: number): Frame {
  const ready = t >= T.ready;
  const saving = t >= T.saving && !ready;
  const connections = t >= T.connections && !saving && !ready;
  const outline = t >= T.outlineStart && t < T.connections;

  const sourcesShown = Math.min(
    SOURCES.length,
    t < 1000 ? 0 : Math.floor((t - 1000) / SOURCE_MS) + 1,
  );
  const lessonsShown =
    ready || saving || connections
      ? TOTAL_LESSONS
      : outline
        ? Math.min(TOTAL_LESSONS, Math.floor((t - T.outlineStart) / LESSON_MS) + 1)
        : 0;

  const stepIndex = ready || saving ? 3 : connections ? 2 : outline ? 1 : 0;

  let message: string;
  if (ready) {
    message = "Outline ready. Opening the review.";
  } else if (saving) {
    message = "Saving the Outline.";
  } else if (connections) {
    message = "Planning how the Lessons connect.";
  } else if (outline) {
    message =
      t < T.outlineDrafting
        ? `Sketching ${MODULES.length} Modules across ${TOTAL_LESSONS} Lessons.`
        : "Drafting the Modules and the Lesson titles.";
  } else if (t >= T.sourcesFound) {
    message = "Found 4 sources worth using.";
  } else if (t >= T.sourcesReading) {
    message = "Reading the sources it found.";
  } else {
    message = "Searching for current sources.";
  }

  return {
    stepIndex,
    message,
    sourcesShown,
    lessonsShown,
    writing: outline && lessonsShown < TOTAL_LESSONS,
    ready,
  };
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function NowColumnMock() {
  const [t, setT] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      setT((performance.now() - start) % LOOP_MS);
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const frame = frameAt(t);
  const reduce = usePrefersReducedMotion();

  /* Every Lesson with its own number, grouped by Module, for the progress
     ruler: the shape of the whole Outline, filled in as it is written. */
  const ruler = useMemo(() => {
    let n = 0;
    return MODULES.map((m) => ({
      numeral: m.numeral,
      lessons: m.lessons.map(() => ++n),
    }));
  }, []);

  const visible = useMemo(() => {
    let n = 0;
    return MODULES.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({ ...l, n: ++n })),
    }))
      .map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.n <= frame.lessonsShown) }))
      .filter((m) => m.lessons.length > 0);
  }, [frame.lessonsShown]);

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0 lg:flex-row">
      <aside className="scroll-thin shrink-0 border-b border-hair bg-panel lg:h-full lg:w-[22rem] lg:overflow-y-auto lg:border-r lg:border-b-0 xl:w-[23rem]">
        <div className="px-5 py-7 sm:px-8 lg:px-7 lg:py-8">
          <div className="mb-7">
            <Button variant="quiet" render={<Link href="/courses" />} className="group -ml-1">
              <ArrowLeft
                className="h-3.5 w-3.5 shrink-0 transition-transform duration-120 ease-expo group-hover:-translate-x-1"
                strokeWidth={1.75}
              />
              Back to Courses
            </Button>
          </div>

          <div className="min-h-[3.2rem]">
            <p
              aria-live="polite"
              className="text-[0.9375rem] leading-[1.55] font-medium text-fg text-balance"
            >
              {frame.message}
            </p>
          </div>

          <div className="relative mt-4 h-px overflow-hidden bg-hair">
            {!frame.ready &&
              (reduce ? (
                <span className="absolute inset-y-0 left-1/3 w-1/3 bg-rule" />
              ) : (
                <motion.span
                  className="absolute inset-y-0 left-0 w-1/3 bg-rule"
                  initial={{ x: "-120%" }}
                  animate={{ x: "420%" }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                />
              ))}
          </div>

          <p className="tnum mt-3 text-[0.75rem] leading-[1.5] text-fg-3">
            Working for {formatElapsed(t)}
          </p>

          <ol className="mt-7 border-t border-hair">
            {STEPS.map((s, i) => {
              const done = i < frame.stepIndex || frame.ready;
              const doing = i === frame.stepIndex && !frame.ready;
              return (
                <li
                  key={s.id}
                  aria-current={doing ? "step" : undefined}
                  className="grid grid-cols-[0.75rem_1fr_auto] items-center gap-x-2.5 border-b border-hair py-2"
                >
                  <span className="flex h-4 w-3 items-center justify-center">
                    {done ? (
                      <DoneCheck striking className="text-fg-3" />
                    ) : doing ? (
                      reduce ? (
                        <span className="block h-3.5 w-[2px] bg-fg" />
                      ) : (
                        <motion.span
                          className="block h-3.5 w-[2px] bg-fg"
                          animate={{ opacity: [1, 1, 0, 0, 1] }}
                          transition={{
                            duration: 1.1,
                            times: [0, 0.45, 0.5, 0.95, 1],
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        />
                      )
                    ) : (
                      <UnsetMark />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[0.8125rem] leading-5",
                      doing ? "font-medium text-fg" : "text-fg-2",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="text-[0.75rem] leading-[1.5] text-fg-3">
                    {done ? "Done" : doing ? "Doing" : "Queued"}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-7">
            <div className="flex items-baseline justify-between gap-3">
              <p className="label text-fg-3">The Outline</p>
              <p className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
                {frame.lessonsShown} of {TOTAL_LESSONS}
              </p>
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2.5" aria-hidden>
              {ruler.map((m) => (
                <span key={m.numeral} className="flex items-center gap-x-1">
                  {m.lessons.map((n) => (
                    <span key={n} className="flex h-3 w-3 items-center justify-center">
                      {n <= frame.lessonsShown ? (
                        <motion.span
                          className={cn(
                            "block h-[2px] w-3 origin-left",
                            frame.writing && n === frame.lessonsShown ? "bg-fg" : "bg-fg-2",
                          )}
                          initial={reduce ? false : { scaleX: 0 }}
                          animate={reduce ? undefined : { scaleX: 1 }}
                          transition={{ duration: 0.3, ease: EASE }}
                        />
                      ) : (
                        <UnsetMark />
                      )}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>

          <p className="mt-7 max-w-[19rem] text-[0.75rem] leading-[1.5] text-fg-3">
            You can leave this page. The Outline will be here when you come back.
          </p>

          <div className="mt-6">
            <CancelRunButton
              idleLabel="Cancel this Course"
              idleIcon={<X className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />}
              confirmLabel="Discard this Course?"
              pendingLabel="Discarding…"
              onConfirm={async () => ({ ok: false, reason: "not-found" }) as const}
              onDone={() => {}}
            />
          </div>
        </div>
      </aside>

      <div className="scroll-thin min-w-0 lg:h-full lg:flex-1 lg:overflow-y-auto">
        <div className="px-5 pt-10 pb-24 sm:px-8">
          <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
            {TOPIC}
          </h1>
          <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">{GOAL}</p>

          <div className="mt-12">
            {visible.length === 0 ? (
              <ProofSkeleton />
            ) : (
              <div className="grid grid-cols-1 items-start gap-x-10 gap-y-9 lg:grid-cols-2 2xl:grid-cols-3">
                {visible.map((m) => {
                  const frontierModule = m.lessons.at(-1)?.n === frame.lessonsShown;
                  return (
                    <section key={m.numeral}>
                      <div className="border-b border-hair pb-2">
                        <h2 className="label block truncate text-fg-3">
                          {m.numeral}. {m.title}
                        </h2>
                      </div>
                      <ul>
                        {m.lessons.map((l) => {
                          const frontier = frame.writing && l.n === frame.lessonsShown;
                          return (
                            <li
                              key={l.n}
                              className="grid grid-cols-[0.75rem_1fr] items-start gap-x-2.5 border-b border-hair py-3"
                            >
                              <span className="flex h-5 w-3 items-center justify-center">
                                {frontier ? <LiveMark /> : null}
                              </span>
                              <motion.span
                                className="min-w-0"
                                initial={
                                  frontier && !reduce ? { clipPath: "inset(0 100% 0 0)" } : false
                                }
                                animate={reduce ? undefined : { clipPath: "inset(0 0% 0 0)" }}
                                transition={{ duration: 0.52, ease: EASE }}
                              >
                                <span className="block truncate text-[0.8125rem] leading-5 font-medium text-fg">
                                  <span className="tnum mr-2 font-normal text-fg-dim">{l.n}</span>
                                  {l.title}
                                </span>
                                <span className="mt-1 block text-[0.8125rem] leading-[1.5] text-fg-3">
                                  {l.summary}
                                </span>
                              </motion.span>
                            </li>
                          );
                        })}
                        {frame.writing && frontierModule && (
                          <li
                            aria-hidden
                            className="grid grid-cols-[0.75rem_1fr] items-start gap-x-2.5 border-b border-hair py-3"
                          >
                            <span className="flex h-5 w-3 items-center justify-center">
                              <UnsetMark />
                            </span>
                            <div className="min-w-0 space-y-2 pt-1">
                              <Skeleton className="h-2.5 w-3/5 rounded-sm motion-reduce:animate-none" />
                              <Skeleton className="h-2.5 w-4/5 rounded-sm motion-reduce:animate-none" />
                            </div>
                          </li>
                        )}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {frame.sourcesShown > 0 && (
            <section className="mt-14 border-t border-hair pt-6">
              <h2 className="label text-fg-3">Sources</h2>
              <ul className="mt-3 grid gap-x-10 sm:grid-cols-2 2xl:grid-cols-4">
                {SOURCES.slice(0, frame.sourcesShown).map((s) => (
                  <motion.li
                    key={s.url}
                    className="border-b border-hair py-2.5"
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={reduce ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, ease: EASE }}
                  >
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[0.8125rem] leading-5 text-fg-2 hover:text-fg"
                    >
                      {s.title}
                    </a>
                    <span className="tnum mt-0.5 block truncate text-[0.75rem] leading-[1.5] text-fg-dim">
                      {s.domain}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </section>
          )}

          {visible.length > 0 && (
            <motion.section
              className="mt-14 border-t border-hair pt-6"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
            >
              <h2 className="label text-fg-3">Why this shape</h2>
              <div className="mt-4 grid gap-x-10 gap-y-6 lg:grid-cols-2">
                <div className="max-w-(--measure)">
                  <p className="label text-fg-dim">You&apos;ll be able to</p>
                  <ul>
                    {WHY.terminalPerformances.map((p) => (
                      <li
                        key={p}
                        className="border-b border-hair py-3 text-[0.8125rem] leading-5 text-fg-2"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="max-w-(--measure) space-y-6">
                  <div>
                    <p className="label text-fg-dim">The premise</p>
                    <p className="mt-3 text-[0.8125rem] leading-[1.6] text-fg-3">{WHY.premise}</p>
                  </div>
                  <div>
                    <p className="label text-fg-dim">Running example</p>
                    <p className="mt-3 text-[0.8125rem] leading-[1.6] text-fg-3">
                      {WHY.runningExample}
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </div>
      </div>
    </div>
  );
}

function ProofSkeleton() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-1 items-start gap-x-10 gap-y-9 lg:grid-cols-2 2xl:grid-cols-3"
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          <div className="border-b border-hair pb-2">
            <Skeleton className="h-2.5 w-2/5 rounded-sm motion-reduce:animate-none" />
          </div>
          <div className="space-y-3 pt-4">
            <Skeleton className="h-2.5 w-4/5 rounded-sm motion-reduce:animate-none" />
            <Skeleton className="h-2.5 w-3/5 rounded-sm motion-reduce:animate-none" />
            <Skeleton className="h-2.5 w-5/6 rounded-sm motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}
