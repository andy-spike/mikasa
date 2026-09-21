"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { CancelRunButton } from "@/components/cancel-run-button";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cancelDesignAction, retryCourseAction } from "@/lib/actions/courses";
import { cn, formatElapsed } from "@/lib/utils";

const STEP_COPY: Record<string, string> = {
  sources: "Gathering sources.",
  outline: "Drafting the Modules and the Lesson titles.",
  specification: "Planning how the Lessons connect.",
  persist: "Saving the Outline.",
};

const STEPS = [
  { id: "sources", label: "Sources" },
  { id: "outline", label: "Outline" },
  { id: "specification", label: "Connections" },
  { id: "persist", label: "Saving" },
] as const;

const EASE = [0.2, 0, 0, 1] as const;

export type DesignProgressEvent = {
  kind: string;
  message: string;
  createdAt: string;
};

export type DesignProgressSource = {
  title: string;
  url: string;
  domain: string;
};

export type DesignPreview = {
  modules: {
    numeral: string;
    title: string;
    lessons: { title: string; summary: string; minutes: number }[];
  }[];
  terminalPerformances: string[];
  premise: string | null;
  runningExample: string | null;
};

type Props = {
  courseId: string;
  topic: string;
  goal: string;
  status: "designing" | "failed";
  step: string;
  error: string | null;
  startedAt?: string;
  events?: DesignProgressEvent[];
  sources?: DesignProgressSource[];
  preview?: DesignPreview | null;
};

function elapsedFrom(startedAt: string, now: number): string {
  return formatElapsed(Math.max(0, now - new Date(startedAt).getTime()));
}

export function CourseDesignProgress({
  courseId,
  topic,
  goal,
  status,
  step,
  error,
  startedAt,
  events = [],
  sources = [],
  preview = null,
}: Props) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const [retrying, setRetrying] = useState(false);
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [cancelled, setCancelled] = useState(false);

  const designing = status === "designing" && !retrying;

  useEffect(() => {
    if (!designing || cancelled) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [designing, cancelled, router]);

  useEffect(() => {
    if (!designing || !startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [designing, startedAt]);

  const currentMessage = useMemo(() => {
    return events[events.length - 1]?.message ?? STEP_COPY[step] ?? "Designing the Course.";
  }, [events, step]);

  const currentIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.id === step),
  );

  /* Every known Lesson with its own number, grouped by Module. The Outline is
     still being written, so only what the model has already returned exists. */
  const numberedModules = useMemo(() => {
    if (!preview) return [];
    let n = 0;
    return preview.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({ ...l, n: ++n })),
    }));
  }, [preview]);

  const lessonCount = numberedModules.reduce((n, m) => n + m.lessons.length, 0);
  const ruler = useMemo(
    () =>
      numberedModules
        .filter((m) => m.lessons.length > 0)
        .map((m) => ({ numeral: m.numeral, lessons: m.lessons.map((l) => l.n) })),
    [numberedModules],
  );

  /* While the Outline step runs, the last known Lesson is the frontier the
     model is writing; a skeleton row follows it. */
  const writing = step === "outline";

  const terminalPerformances = preview?.terminalPerformances ?? [];
  const premise = preview?.premise ?? null;
  const runningExample = preview?.runningExample ?? null;
  const hasWhy =
    terminalPerformances.length > 0 ||
    Boolean(premise) ||
    Boolean(runningExample) ||
    numberedModules.length > 0;

  function retry() {
    setRetrying(true);
    startTransition(async () => {
      await retryCourseAction(courseId);
      setRetrying(false);
      router.refresh();
    });
  }

  if (!designing) {
    return (
      <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8" aria-live="polite">
        <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
          {topic}
        </h1>
        <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">{goal}</p>
        <div className="mt-8 border-t border-hair pt-6">
          <p className="label text-fg-3">Design failed</p>
          <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
            {error ?? "The design did not finish."}
          </p>
          <p className="mt-2 max-w-(--measure) text-[0.75rem] leading-[1.5] text-fg-3">
            Nothing was written. Designing again starts from the Topic, the Goal and this
            Course&rsquo;s settings.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button onClick={retry} disabled={retrying}>
              {retrying ? "Starting again…" : "Design again"}
            </Button>
            <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
              Back to Courses
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
              {currentMessage}
            </p>
          </div>

          <div className="relative mt-4 h-px overflow-hidden bg-hair">
            {reduce ? (
              <span className="absolute inset-y-0 left-1/3 w-1/3 bg-rule" />
            ) : (
              <motion.span
                className="absolute inset-y-0 left-0 w-1/3 bg-rule"
                initial={{ x: "-120%" }}
                animate={{ x: "420%" }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
              />
            )}
          </div>

          {startedAt ? (
            <p className="tnum mt-3 text-[0.75rem] leading-[1.5] text-fg-3">
              Working for {elapsedFrom(startedAt, now)}
            </p>
          ) : null}

          <ol className="mt-7 border-t border-hair">
            {STEPS.map((s, i) => {
              const done = i < currentIndex;
              const doing = i === currentIndex;
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
                {lessonCount} {lessonCount === 1 ? "Lesson" : "Lessons"}
              </p>
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2.5" aria-hidden>
              {ruler.map((m) => (
                <span key={m.numeral} className="flex items-center gap-x-1">
                  {m.lessons.map((n) => (
                    <span key={n} className="flex h-3 w-3 items-center justify-center">
                      <motion.span
                        className={cn(
                          "block h-[2px] w-3 origin-left",
                          writing && n === lessonCount ? "bg-fg" : "bg-fg-2",
                        )}
                        initial={reduce ? false : { scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                      />
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
              onConfirm={() => cancelDesignAction(courseId)}
              onDone={(result) => {
                if (result.ok) {
                  setCancelled(true);
                  router.push("/courses");
                } else router.refresh();
              }}
            />
          </div>
        </div>
      </aside>

      <div className="scroll-thin min-w-0 lg:h-full lg:flex-1 lg:overflow-y-auto">
        <div className="px-5 pt-10 pb-24 sm:px-8">
          <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
            {topic}
          </h1>
          <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">{goal}</p>

          <div className="mt-12">
            {numberedModules.length === 0 ? (
              <ProofSkeleton reduce={reduce} />
            ) : (
              <div className="grid grid-cols-1 items-start gap-x-10 gap-y-9 lg:grid-cols-2 2xl:grid-cols-3">
                {numberedModules.map((m) => {
                  const frontierModule = writing && m.lessons.at(-1)?.n === lessonCount;
                  return (
                    <section key={`${m.numeral}-${m.title}`}>
                      <div className="border-b border-hair pb-2">
                        <h2 className="label block truncate text-fg-3">
                          {m.numeral}. {m.title}
                        </h2>
                      </div>
                      <ul>
                        {m.lessons.map((l) => {
                          const frontier = writing && l.n === lessonCount;
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
                                animate={{ clipPath: "inset(0 0% 0 0)" }}
                                transition={
                                  reduce ? { duration: 0 } : { duration: 0.52, ease: EASE }
                                }
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
                        {frontierModule && (
                          <li
                            aria-hidden
                            className="grid grid-cols-[0.75rem_1fr] items-start gap-x-2.5 border-b border-hair py-3"
                          >
                            <span className="flex h-5 w-3 items-center justify-center">
                              <UnsetMark />
                            </span>
                            <div className="min-w-0 space-y-2 pt-1">
                              <Pulse reduce={reduce} className="w-3/5" />
                              <Pulse reduce={reduce} className="w-4/5" />
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

          {sources.length > 0 && (
            <section className="mt-14 border-t border-hair pt-6">
              <h2 className="label text-fg-3">Sources</h2>
              <ul className="mt-3 grid gap-x-10 sm:grid-cols-2 2xl:grid-cols-4">
                {sources.map((s) => (
                  <motion.li
                    key={s.url}
                    className="border-b border-hair py-2.5"
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE }}
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

          {hasWhy && (
            <motion.section
              className="mt-14 border-t border-hair pt-6"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE }}
            >
              <h2 className="label text-fg-3">Why this shape</h2>
              <div className="mt-4 grid gap-x-10 gap-y-6 lg:grid-cols-2">
                <div className="max-w-(--measure)">
                  <p className="label text-fg-dim">You&apos;ll be able to</p>
                  {terminalPerformances.length > 0 ? (
                    <ul>
                      {terminalPerformances.map((p) => (
                        <li
                          key={p}
                          className="border-b border-hair py-3 text-[0.8125rem] leading-5 text-fg-2"
                        >
                          {p}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="space-y-3 pt-3">
                      <Pulse reduce={reduce} className="w-4/5" />
                      <Pulse reduce={reduce} className="w-3/5" />
                    </div>
                  )}
                </div>
                <div className="max-w-(--measure) space-y-6">
                  <div>
                    <p className="label text-fg-dim">The premise</p>
                    {premise ? (
                      <p className="mt-3 text-[0.8125rem] leading-[1.6] text-fg-3">{premise}</p>
                    ) : (
                      <div className="pt-3">
                        <Pulse reduce={reduce} className="w-4/5" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="label text-fg-dim">Running example</p>
                    {runningExample ? (
                      <p className="mt-3 text-[0.8125rem] leading-[1.6] text-fg-3">
                        {runningExample}
                      </p>
                    ) : (
                      <div className="pt-3">
                        <Pulse reduce={reduce} className="w-3/5" />
                      </div>
                    )}
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

/* The design system's skeleton surface, pulsed by Motion so the whole screen
   runs on one motion system; reduced motion holds it still. */
function Pulse({ className, reduce }: { className?: string; reduce: boolean }) {
  return (
    <motion.div
      aria-hidden
      className={cn("h-2.5 bg-muted", className)}
      animate={reduce ? { opacity: 1 } : { opacity: [1, 0.45, 1] }}
      transition={reduce ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: "linear" }}
    />
  );
}

function ProofSkeleton({ reduce }: { reduce: boolean }) {
  return (
    <div
      aria-hidden
      className="grid grid-cols-1 items-start gap-x-10 gap-y-9 lg:grid-cols-2 2xl:grid-cols-3"
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          <div className="border-b border-hair pb-2">
            <Pulse reduce={reduce} className="w-2/5" />
          </div>
          <div className="space-y-3 pt-4">
            <Pulse reduce={reduce} className="w-4/5" />
            <Pulse reduce={reduce} className="w-3/5" />
            <Pulse reduce={reduce} className="w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}
