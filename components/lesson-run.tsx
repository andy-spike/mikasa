"use client";

/* The Writer's Column: the writing run and the check, shown while a Course is
   `generating` or `reviewing`. One Lesson at the measure with the queue (or the
   check's findings) in a panel margin, and, from `xl`, a rail of the pages
   already written.

   A Lesson is saved whole, so the page in hand never replays a fill: while the
   run writes, the newest page stands at the measure and the skeleton rules
   below it stand for the one being written (before anything has landed they are
   the frontier's only page). Once the check begins the page follows the first
   finding still open, and a pin holds any written page through every phase.
   What arrives arrives complete. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { CancelRunButton } from "@/components/cancel-run-button";
import { Skeleton } from "@/components/ui/skeleton";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import { Inline, LessonBlock } from "@/components/workspace/prose";
import { cancelGenerationAction } from "@/lib/actions/courses";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn, formatElapsed } from "@/lib/utils";
import type { ReadingCourse, ReadingLesson } from "@/lib/course/reading";

const EASE = [0.2, 0, 0, 1] as const;
/* One ease, two durations: the page turns, the run settles. */
const DUR_TURN = 0.2;
const DUR_SETTLE = 0.24;

/* The design screen's own cadence, so a run that has moved on arrives without
   the learner asking for it. */
const POLL_MS = 4000;

const LEAVE_NOTE = "You can leave this page. The Course will be here when you come back.";

/** One finding of the check, as this surface reads it. */
export type RunFinding = {
  id: string;
  kind: "structural" | "factual";
  lessonRef: string | null;
  detail: string;
  corrected: boolean;
};

type Props = {
  courseId: string;
  /** The Course in reading order; only written Lessons carry a body. */
  course: ReadingCourse;
  status: "generating" | "reviewing";
  /** The run's `currentStep`; null when no run row exists yet. */
  runStep: string | null;
  /** The run's start, ISO. The elapsed figure is measured from it. */
  startedAt: string | null;
  /** The check's findings for the round it is on. */
  findings: RunFinding[];
};

type FlatLesson = ReadingLesson & { n: number };

type Phase = "writing" | "checking" | "correcting" | "publishing";

/* The run's own facts say which life this is: `generating` writes Lessons,
   `reviewing` checks them, corrects what the check found, then publishes. */
function phaseOf(status: Props["status"], runStep: string | null): Phase {
  if (status === "generating" && runStep !== "publish") return "writing";
  if (runStep === "publish" || runStep === "complete") return "publishing";
  if (runStep?.startsWith("corrections:")) return "correcting";
  return "checking";
}

function roundOf(runStep: string | null): number {
  const match = /^corrections:(\d+)$/.exec(runStep ?? "");
  const round = match ? Number(match[1]) : 0;
  return Number.isFinite(round) ? round : 0;
}

function elapsedFrom(startedAt: string, now: number): string {
  return formatElapsed(Math.max(0, now - new Date(startedAt).getTime()));
}

export function LessonRun({ courseId, course, status, runStep, startedAt, findings }: Props) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const [pinned, setPinned] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      /* A hidden tab stops asking; the next visible poll catches up. */
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const flat = useMemo<FlatLesson[]>(() => {
    let n = 0;
    return course.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({ ...lesson, n: ++n })),
    );
  }, [course]);

  /* The check names its findings in reading order, whatever the table hands
     back in: the first still-open one is the finding in hand. */
  const orderedFindings = useMemo(() => {
    const order = new Map(flat.map((lesson) => [lesson.id, lesson.n]));
    const beyond = flat.length + 1;
    return [...findings].sort(
      (a, b) => (order.get(a.lessonRef ?? "") ?? beyond) - (order.get(b.lessonRef ?? "") ?? beyond),
    );
  }, [findings, flat]);

  const phase = phaseOf(status, runStep);
  const round = roundOf(runStep);
  const writing = phase === "writing";
  const publishing = phase === "publishing";

  const total = flat.length;
  const written = flat.filter((lesson) => lesson.status !== "unset");
  const writtenCount = written.length;
  const frontier = flat.find((lesson) => lesson.status === "unset") ?? null;
  const lastWritten = written[written.length - 1] ?? null;

  const byId = useMemo(() => new Map(flat.map((lesson) => [lesson.id, lesson])), [flat]);
  const openFindings = orderedFindings.filter((finding) => !finding.corrected);
  const findingInHand = writing
    ? null
    : (openFindings[0] ?? orderedFindings[orderedFindings.length - 1] ?? null);

  /* The page follows the work; a pin holds any written page through the run.
     While the Lessons are being written, the writer has only whole pages to
     hand over: the newest one stands at the measure, and the page it is
     writing now is the skeleton below it. Before the first page lands, that
     skeleton is the frontier itself. */
  const owed = writing
    ? (lastWritten ?? frontier)
    : ((findingInHand?.lessonRef ? byId.get(findingInHand.lessonRef) : undefined) ?? null);
  const page = (pinned ? byId.get(pinned) : undefined) ?? owed ?? lastWritten ?? flat[0];

  if (!page) return null;

  const openIsFrontier = writing && frontier !== null && page.id === frontier.id;
  /* The run still owes a page, so a skeleton tail follows the one in hand. */
  const skeletonTail = writing && frontier !== null && !openIsFrontier;

  const pageFinding = writing
    ? null
    : (orderedFindings.find((finding) => finding.lessonRef === page.id) ?? null);
  const pageFixed = pageFinding?.corrected ?? false;
  const pageFixing =
    phase === "correcting" && pageFinding !== null && openFindings[0]?.id === pageFinding.id;

  const correctedCount = orderedFindings.length - openFindings.length;
  const checked = publishing || (orderedFindings.length > 0 && openFindings.length === 0);

  /* A draft says so until the check has run on it; the finding's own strip
     carries the state of a page the check has already named. */
  const statusLine = pageFinding
    ? null
    : writing
      ? openIsFrontier
        ? "Being written now."
        : "Draft · the check runs after the last Lesson."
      : checked
        ? "Checked."
        : "Draft · the check is running.";

  const phaseLine = writing
    ? "Writing the Lessons."
    : phase === "checking"
      ? `All ${total} Lessons are written. The check is running.`
      : phase === "correcting"
        ? round > 1
          ? "Re-checking the corrections."
          : "Correcting what the check found."
        : "Every Lesson passed the check.";

  /* The pinned bar tracks the phase, so a pin is always reversible. */
  const barLine =
    writing && frontier ? (
      <>
        Writing now · Lesson {frontier.n}: <span className="text-fg-2">{frontier.title}</span>
      </>
    ) : writing ? (
      "Writing the Lessons."
    ) : phase === "checking" ? (
      "The check is running"
    ) : phase === "correcting" ? (
      round > 1 ? (
        "Re-checking the corrections"
      ) : (
        "Correcting what the check found"
      )
    ) : (
      "Every Lesson passed the check"
    );
  const barKey = writing && frontier ? `lesson:${frontier.id}` : phase;

  /* Every scrolling region reserves the scrollbar's lane, so a page that grows
     past the fold never reflows the moment the bar appears. */
  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0 lg:flex-row">
      <aside
        aria-label="The run"
        className="scroll-thin shrink-0 border-b border-hair bg-panel px-5 py-7 sm:px-8 lg:h-full lg:w-[20rem] lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-5 lg:py-8 [scrollbar-gutter:stable]"
      >
        <div className="flex min-h-full flex-col">
          <div className="mb-1">
            <motion.span initial={false} animate="rest" whileHover="hover" className="inline-flex">
              <Button variant="quiet" render={<Link href="/courses" />} className="-ml-1">
                <motion.span
                  variants={{ rest: { x: 0 }, hover: { x: reduce ? 0 : -4 } }}
                  transition={{ duration: reduce ? 0 : 0.12, ease: EASE }}
                  className="inline-flex"
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                </motion.span>
                Back to Courses
              </Button>
            </motion.span>
          </div>

          <h1 className="mt-1 text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
            {course.topic}
          </h1>
          <p className="mt-2 text-[0.8125rem] leading-[1.5] text-fg-3">{course.goal}</p>

          {/* Two lines are held for the phase, so the rule and the elapsed
              below it hold the same distance in every phase. */}
          <p
            aria-live="polite"
            className="mt-8 flex min-h-[2.6rem] items-end text-[0.9375rem] leading-[1.55] font-medium text-balance text-fg"
          >
            <Settle key={phaseLine}>{phaseLine}</Settle>
          </p>

          <div className="relative mt-4 h-px overflow-hidden bg-hair">
            {!publishing &&
              (reduce ? (
                <span className="absolute inset-y-0 left-1/3 w-1/3 bg-rule" />
              ) : (
                <motion.span
                  className="absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent from-25% via-rule via-50% to-transparent to-75%"
                  initial={{ x: "-105%" }}
                  animate={{ x: "310%" }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
          </div>

          <p className="tnum mt-3 text-[0.75rem] leading-[1.5] text-fg-3">
            {startedAt ? `Working for ${elapsedFrom(startedAt, now)}` : "Starting."}
          </p>

          {!publishing && (
            <div className="mt-4">
              <CancelRunButton
                idleLabel="Cancel generation"
                idleIcon={<X className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />}
                confirmLabel="Discard the partial Course?"
                pendingLabel="Discarding…"
                onConfirm={() => cancelGenerationAction(courseId)}
                onDone={(result) => {
                  if (result.ok) {
                    setError(null);
                    router.refresh();
                  } else {
                    setError(
                      result.reason === "too-late"
                        ? "This Course already moved past generation. Reload the page."
                        : "The Course could not be discarded.",
                    );
                  }
                }}
              />
              {error && (
                <p role="alert" className="mt-3 text-[0.8125rem] leading-[1.5] text-fg-2">
                  {error}
                </p>
              )}
            </div>
          )}

          {writing ? (
            <motion.div
              key="queue"
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR_SETTLE, ease: EASE }}
              className="mt-8"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="label text-fg-3">The Course</p>
                <p className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
                  <Count value={`${writtenCount} of ${total}`} />
                </p>
              </div>

              <ol className="mt-3 hidden border-t border-hair lg:block">
                {flat.map((lesson) => {
                  const done = lesson.status !== "unset";
                  const doing = frontier !== null && lesson.id === frontier.id;
                  const current = page.id === lesson.id;
                  return (
                    <motion.li
                      key={lesson.id}
                      variants={{ rest: {}, hover: {} }}
                      initial={false}
                      animate="rest"
                      whileHover={done ? "hover" : undefined}
                      aria-current={doing ? "true" : undefined}
                      className="relative border-b border-hair"
                    >
                      <HoverGround reduce={reduce} />
                      <Button
                        variant="bare"
                        onClick={done ? () => setPinned(lesson.id) : undefined}
                        aria-disabled={done ? undefined : "true"}
                        aria-current={current ? "true" : undefined}
                        className={cn(
                          "relative grid w-full grid-cols-[0.75rem_1rem_minmax(0,1fr)] items-center gap-x-2 px-2 py-1.5 text-left",
                          current && "bg-raised",
                        )}
                      >
                        <span className="flex h-4 w-3 items-center justify-center">
                          <Mark state={done ? "done" : doing ? "doing" : "todo"} />
                        </span>
                        <span className="tnum text-right text-[0.75rem] leading-[1.5] text-fg-dim">
                          {lesson.n}
                        </span>
                        <span
                          className={cn(
                            "truncate text-[0.8125rem] leading-5",
                            current
                              ? "text-fg"
                              : done
                                ? "text-fg-2"
                                : doing
                                  ? "font-medium text-fg"
                                  : "text-fg-3",
                          )}
                        >
                          {lesson.title}
                        </span>
                      </Button>
                    </motion.li>
                  );
                })}
              </ol>

              {/* Below `lg` the queue is a ruler: one tick per Lesson, grouped
                  by Module, filled as the run writes it. */}
              <div
                className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2.5 lg:hidden"
                aria-hidden
              >
                {course.modules.map((module) => (
                  <span key={module.numeral} className="flex items-center gap-x-1">
                    {module.lessons.map((lesson) => {
                      const done = lesson.status !== "unset";
                      const frontierTick = frontier !== null && lesson.id === frontier.id;
                      return (
                        <span key={lesson.id} className="flex h-3 w-3 items-center justify-center">
                          {done || frontierTick ? (
                            <motion.span
                              className={cn(
                                "block h-[2px] w-3 origin-left",
                                frontierTick ? "bg-fg" : "bg-fg-2",
                              )}
                              initial={reduce ? false : { scaleX: 0 }}
                              animate={reduce ? undefined : { scaleX: 1 }}
                              transition={{ duration: 0.3, ease: EASE }}
                            />
                          ) : (
                            <UnsetMark />
                          )}
                        </span>
                      );
                    })}
                  </span>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="findings"
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR_SETTLE, ease: EASE }}
              className="mt-8"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="label text-fg-3">The check</p>
                {orderedFindings.length > 0 && (
                  <p className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
                    <Count value={`${correctedCount} of ${orderedFindings.length}`} />
                  </p>
                )}
              </div>

              {orderedFindings.length === 0 ? (
                <div className="mt-3 border-t border-hair pt-3">
                  <p className="text-[0.8125rem] leading-[1.5] text-fg-3">
                    The check is reading the Course.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 border-t border-hair">
                  {orderedFindings.map((finding) => {
                    const lesson = finding.lessonRef ? byId.get(finding.lessonRef) : undefined;
                    const fixing = phase === "correcting" && openFindings[0]?.id === finding.id;
                    return (
                      <motion.li
                        key={finding.id}
                        variants={{
                          hidden: { opacity: 0, y: 4 },
                          rest: { opacity: 1, y: 0 },
                          hover: {},
                        }}
                        initial={reduce ? false : "hidden"}
                        animate="rest"
                        whileHover="hover"
                        transition={{ duration: DUR_SETTLE, ease: EASE }}
                        className="relative border-b border-hair"
                      >
                        <HoverGround reduce={reduce} />
                        <Button
                          variant="bare"
                          onClick={lesson ? () => setPinned(lesson.id) : undefined}
                          aria-current={page.id === lesson?.id ? "true" : undefined}
                          className={cn(
                            "relative block w-full px-2 py-2.5 text-left",
                            page.id === lesson?.id && "bg-raised",
                          )}
                        >
                          <span className="flex items-center gap-x-2">
                            <span className="flex h-4 w-3 shrink-0 items-center justify-center">
                              <Mark
                                state={finding.corrected ? "done" : fixing ? "doing" : "todo"}
                              />
                            </span>
                            <span className="label text-fg-dim">
                              {finding.kind === "factual" ? "Accuracy" : "Structure"}
                            </span>
                            {lesson && (
                              <span className="tnum ml-auto shrink-0 text-[0.75rem] leading-[1.5] text-fg-dim">
                                Lesson {lesson.n}
                              </span>
                            )}
                          </span>
                          <span className="mt-1.5 block text-[0.8125rem] leading-[1.5] text-fg-2">
                            <Inline text={finding.detail} />
                          </span>
                          <span className="mt-1.5 block text-[0.75rem] leading-[1.5] text-fg-3">
                            <Settle
                              key={finding.corrected ? "fixed" : fixing ? "fixing" : "queued"}
                            >
                              {finding.corrected
                                ? "Fixed."
                                : fixing
                                  ? "Fixing now."
                                  : "Queued for correction."}
                            </Settle>
                          </span>
                        </Button>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
            </motion.div>
          )}

          {publishing ? (
            <div className="mt-auto pt-8">
              <Button render={<Link href={`/courses/${courseId}`} />}>Open the Course</Button>
            </div>
          ) : (
            <p className="mt-auto max-w-[19rem] pt-8 text-[0.75rem] leading-[1.5] text-fg-3">
              {LEAVE_NOTE}
            </p>
          )}
        </div>
      </aside>

      <div className="scroll-thin min-w-0 lg:h-full lg:flex-1 lg:overflow-y-auto [scrollbar-gutter:stable]">
        <article className="mx-auto w-full max-w-[41rem] px-5 pt-6 pb-24 sm:px-8 sm:pt-9 lg:px-10">
          <AnimatePresence initial={false}>
            {pinned && (
              <motion.div
                key="pinned"
                initial={reduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: DUR_SETTLE, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="pb-8">
                  <div className="flex items-center justify-between gap-4 border-b border-hair pb-3">
                    <p className="min-w-0 truncate text-[0.75rem] leading-[1.5] text-fg-3">
                      <Settle key={barKey} className="inline">
                        {barLine}
                      </Settle>
                    </p>
                    <Button variant="quiet" className="shrink-0" onClick={() => setPinned(null)}>
                      {writing ? "Return to writing" : "Return to the run"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            key={page.id}
            initial={reduce ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR_TURN, ease: EASE }}
          >
            <AnimatePresence initial={false}>
              {pageFinding && (
                <motion.div
                  key={pageFinding.id}
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduce ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: DUR_SETTLE, ease: EASE }}
                  className="overflow-hidden"
                >
                  {/* While the run still owes this page work — queued or being
                      fixed — the strip's own line carries the accent and the
                      live mark, and the fix in flight is written in the accent
                      too; the moment it lands, all three go quiet. */}
                  <div className="pb-8">
                    <div className="border-b border-hair pb-4">
                      <p className={cn("label min-h-3", pageFixed ? "text-fg-dim" : "text-live")}>
                        <Settle
                          key={pageFixed ? "fixed" : "checking"}
                          className="inline-flex items-center gap-2"
                        >
                          {!pageFixed && <LiveMark />}
                          The check · {pageFinding.kind === "factual" ? "Accuracy" : "Structure"}
                        </Settle>
                      </p>
                      <p className="mt-2 max-w-(--measure) text-[0.8125rem] leading-[1.5] text-fg-2">
                        <Inline text={pageFinding.detail} />
                      </p>
                      <p className="mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
                        <Settle
                          key={pageFixed ? "fixed" : pageFixing ? "fixing" : "queued"}
                          className="inline-flex items-center gap-2"
                        >
                          {pageFixed ? (
                            <>
                              <span className="text-fg-2">
                                <DoneCheck />
                              </span>
                              Fixed in this round.
                            </>
                          ) : pageFixing ? (
                            <span className="text-live">Fixing now.</span>
                          ) : (
                            "Queued for correction."
                          )}
                        </Settle>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="tnum text-[0.75rem] leading-[1.5] text-fg-3">
              Lesson {page.n} of {total}
            </p>

            <h2 className="mt-2.5 max-w-[22ch] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance text-fg sm:text-[2.25rem]">
              {page.title}
            </h2>

            {statusLine && (
              <p className="mt-3 text-[0.75rem] leading-[1.5] text-fg-3">{statusLine}</p>
            )}
          </motion.div>

          <div className="mt-9 space-y-6">
            {page.body.map((block, i) => (
              <LessonBlock key={i} block={block} />
            ))}
          </div>

          {page.exercise && (
            <section className="mt-12 max-w-(--measure) border-t border-hair pt-7">
              <h3 className="label text-fg-3">Exercise</h3>
              <p className="mt-3.5 text-[1rem] leading-[1.7] text-fg">
                <Inline text={page.exercise.task} />
              </p>
              <p className="mt-3 text-[0.9375rem] leading-[1.62] text-fg-3">
                <Inline text={page.exercise.check} />
              </p>
            </section>
          )}

          {/* The tail stands for the page the writer is on now: the frontier's
              own page before anything has landed, and the page after this one
              while the run still owes the Course words. */}
          {(openIsFrontier || skeletonTail) && (
            <div className="mt-9">
              <SkeletonTail />
            </div>
          )}
        </article>

        {/* Below `xl` the written pages list under the page instead of in a rail. */}
        <div className="mx-auto mt-14 w-full max-w-[41rem] px-5 pb-28 sm:px-8 xl:hidden">
          <div className="flex items-baseline justify-between gap-3 border-b border-hair pb-2">
            <p className="label text-fg-3">Written</p>
            <p className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
              {writtenCount} of {total}
            </p>
          </div>
          <WrittenList items={written} openId={page.id} onOpen={setPinned} touch />
        </div>
      </div>

      <aside
        aria-label="Written Lessons"
        className="scroll-thin hidden shrink-0 border-l border-hair bg-panel xl:block xl:h-full xl:w-[20rem] xl:overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="px-5 py-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-hair pb-2">
            <p className="label text-fg-3">Written</p>
            <p className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
              <Count value={`${writtenCount} of ${total}`} />
            </p>
          </div>
          <WrittenList items={written} openId={page.id} onOpen={setPinned} />
        </div>
      </aside>
    </div>
  );
}

/* The page's pulse runs through motion like everything else on this screen;
   the Skeleton stays the design system's surface, with its CSS pulse off. */
const UNPULSED = { animation: "none" } as const;

function SkeletonTail() {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.div
      aria-hidden
      className="max-w-(--measure) space-y-3.5"
      animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
      transition={reduce ? undefined : { duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
    >
      <Skeleton className="h-4 w-4/5 rounded-sm bg-panel" style={UNPULSED} />
      <Skeleton className="h-4 w-3/5 rounded-sm bg-panel" style={UNPULSED} />
      <Skeleton className="h-4 w-2/3 rounded-sm bg-panel" style={UNPULSED} />
    </motion.div>
  );
}

/* A figure that settles when it changes, so the counts move when the run does. */
function Count({ value, className }: { value: string; className?: string }) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.span
      key={value}
      initial={reduce ? false : { opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR_SETTLE, ease: EASE }}
      className={cn("inline-block", className)}
    >
      {value}
    </motion.span>
  );
}

/* Text the run rewrites settles into place instead of blinking. */
function Settle({
  children,
  className = "inline-block",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR_SETTLE, ease: EASE }}
      className={className}
    >
      {children}
    </motion.span>
  );
}

/* The row's hover ground runs through motion like everything else: the same
   raised surface the product gives its rail rows, driven by the pointer
   instead of a CSS rule. The row owns the variant that turns it on. */
function HoverGround({ reduce }: { reduce: boolean }) {
  return (
    <motion.span
      aria-hidden
      variants={{ hidden: { opacity: 0 }, rest: { opacity: 0 }, hover: { opacity: 1 } }}
      transition={{ duration: reduce ? 0 : 0.15, ease: EASE }}
      className="pointer-events-none absolute inset-0 bg-raised"
    />
  );
}

/* The mark hands over: the triangle becomes a check the moment the run moves on. */
function Mark({ state }: { state: "done" | "doing" | "todo" }) {
  const reduce = usePrefersReducedMotion();
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        key={state}
        initial={reduce ? false : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduce ? undefined : { opacity: 0, scale: 0.7 }}
        transition={{ duration: DUR_TURN, ease: EASE }}
        className="flex items-center justify-center"
      >
        {state === "done" ? <DoneCheck /> : state === "doing" ? <LiveMark /> : <UnsetMark />}
      </motion.span>
    </AnimatePresence>
  );
}

/* The written stack. A page lands the moment the run finishes it. */
function WrittenList({
  items,
  openId,
  onOpen,
  touch = false,
}: {
  items: FlatLesson[];
  openId: string;
  onOpen: (id: string) => void;
  touch?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-3 text-[0.75rem] leading-[1.5] text-fg-3">
        Pages appear here as the run writes them.
      </p>
    );
  }
  return (
    <ul>
      {items.map((lesson) => (
        <WrittenRow
          key={lesson.id}
          lesson={lesson}
          open={lesson.id === openId}
          onOpen={() => onOpen(lesson.id)}
          touch={touch}
        />
      ))}
    </ul>
  );
}

function WrittenRow({
  lesson,
  open,
  onOpen,
  touch,
}: {
  lesson: FlatLesson;
  open: boolean;
  onOpen: () => void;
  touch: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.li
      variants={{ hidden: { opacity: 0, y: 5 }, rest: { opacity: 1, y: 0 }, hover: {} }}
      initial={reduce ? false : "hidden"}
      animate="rest"
      whileHover="hover"
      transition={{ duration: DUR_SETTLE, ease: EASE }}
      className="relative border-b border-hair"
    >
      <HoverGround reduce={reduce} />
      <Button
        variant="bare"
        onClick={onOpen}
        aria-current={open ? "true" : undefined}
        className={cn(
          "relative flex w-full min-w-0 items-center gap-2.5 px-2 text-left",
          touch ? "min-h-11 py-2.5" : "py-2",
          open && "bg-raised",
        )}
      >
        <span className="tnum shrink-0 text-[0.75rem] leading-[1.5] text-fg-dim">{lesson.n}</span>
        <span className={cn("truncate text-[0.8125rem] leading-5", open ? "text-fg" : "text-fg-2")}>
          {lesson.title}
        </span>
      </Button>
    </motion.li>
  );
}
