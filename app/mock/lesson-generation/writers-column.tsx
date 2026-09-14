"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { CancelRunButton } from "@/components/cancel-run-button";
import { Skeleton } from "@/components/ui/skeleton";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import { Inline, LessonBlock } from "@/components/workspace/prose";
import { cn } from "@/lib/utils";
import {
  CHECK_END,
  CORRECT_END,
  CORRECT_LAND_MS,
  CORRECT_MS,
  DOCS,
  FINDINGS,
  GOAL,
  LOOP_MS,
  MODULES,
  RE_CHECK_MS,
  TOPIC,
  TOTAL_LESSONS,
  WRITE_END,
  WRITE_MS,
  type LessonDoc,
} from "./fixture";

const EASE = [0.2, 0, 0, 1] as const;
/* One ease, three durations: the page turns, the run settles, the ink writes. */
const DUR_TURN = 0.2;
const DUR_SETTLE = 0.24;
const DUR_WRITE = 0.52;

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

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

type FlatLesson = {
  id: string;
  title: string;
  summary: string;
  n: number;
  doc: LessonDoc;
};

/* One flat reading order, the same order the run writes in. */
const FLAT: FlatLesson[] = (() => {
  let n = 0;
  return MODULES.flatMap((m) => m.lessons.map((l) => ({ ...l, n: ++n, doc: DOCS[l.id] })));
})();

type Frame =
  | { phase: "writing"; written: number; current: number; fill: number }
  | { phase: "check"; found: number }
  | { phase: "correcting"; fixed: number; landed: number }
  | { phase: "recheck" }
  | { phase: "ready" };

function frameAt(t: number): Frame {
  if (t < WRITE_END) {
    const index = Math.min(TOTAL_LESSONS - 1, Math.floor(t / WRITE_MS));
    return { phase: "writing", written: index, current: index, fill: (t % WRITE_MS) / WRITE_MS };
  }
  if (t < CHECK_END) {
    const local = t - WRITE_END;
    const found = local < 1500 ? 0 : local < 3500 ? 1 : local < 5500 ? 2 : FINDINGS.length;
    return { phase: "check", found };
  }
  if (t < CORRECT_END) {
    const local = t - CHECK_END;
    const fixed = Math.floor(local / CORRECT_MS);
    const landed = Math.min(
      fixed + (local % CORRECT_MS >= CORRECT_LAND_MS ? 1 : 0),
      FINDINGS.length,
    );
    return { phase: "correcting", fixed: Math.min(fixed, FINDINGS.length), landed };
  }
  if (t < CORRECT_END + RE_CHECK_MS) return { phase: "recheck" };
  return { phase: "ready" };
}

export function WritersColumnMock({ docs }: { docs: Record<string, LessonDoc> }) {
  const [t, setT] = useState(0);
  const [pinned, setPinned] = useState<string | null>(null);
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    /* `?t=<ms>` opens the run at a chosen moment for inspection. */
    const param = Number(new URLSearchParams(window.location.search).get("t"));
    const offset = Number.isFinite(param) && param > 0 ? param % LOOP_MS : 0;
    const start = performance.now() - offset;
    const timer = window.setInterval(() => setT((performance.now() - start) % LOOP_MS), 250);
    return () => window.clearInterval(timer);
  }, []);

  const frame = frameAt(t);
  const writing = frame.phase === "writing";
  const ready = frame.phase === "ready";

  const writtenCount = writing ? frame.written : TOTAL_LESSONS;
  const frontier = writing ? FLAT[frame.current] : null;

  /* The page follows the work: the frontier while it is written, then the
     finding in hand while the check runs and its corrections land. */
  const lastFinding = FINDINGS[FINDINGS.length - 1];
  const findingInHand =
    frame.phase === "correcting"
      ? (FINDINGS[frame.fixed] ?? lastFinding)
      : frame.phase === "check"
        ? frame.found > 0
          ? FINDINGS[frame.found - 1]
          : null
        : frame.phase === "recheck" || frame.phase === "ready"
          ? lastFinding
          : null;
  const lessonFor = (f: (typeof FINDINGS)[number]) =>
    FLAT.find((l) => l.id === f.lessonRef) ?? FLAT[FLAT.length - 1];
  const runPage = frontier ?? (findingInHand ? lessonFor(findingInHand) : FLAT[FLAT.length - 1]);
  const open = pinned ? (FLAT.find((l) => l.id === pinned) ?? runPage) : runPage;
  /* The page's blocks arrive pre-highlighted from the server; the fixture's own
     copy is the plain fallback. */
  const doc = docs[open.id] ?? open.doc;
  const frontierOpen = writing && frontier !== null && open.id === frontier.id;
  const readable = (l: FlatLesson) => l.n <= writtenCount;

  const foundCount =
    frame.phase === "check" ? frame.found : frame.phase === "writing" ? 0 : FINDINGS.length;
  const fixedIds = new Set(
    frame.phase === "correcting"
      ? FINDINGS.slice(0, frame.landed).map((f) => f.id)
      : frame.phase === "recheck" || frame.phase === "ready"
        ? FINDINGS.map((f) => f.id)
        : [],
  );
  /* A fix in flight carries the live mark; once it lands the page holds the
     corrected body for a beat before the run turns to the next finding. */
  const fixingId =
    frame.phase === "correcting" && frame.landed === frame.fixed
      ? (FINDINGS[frame.fixed]?.id ?? null)
      : null;

  const finding = FINDINGS.find((f) => f.lessonRef === open.id) ?? null;
  /* A finding may only show once the check has reached it in the list. */
  const findingFound = finding ? FINDINGS.indexOf(finding) < foundCount : false;
  const corrected = finding ? fixedIds.has(finding.id) : false;
  const body = corrected ? (doc.correctedBody ?? doc.body) : doc.body;

  const progress = frontierOpen
    ? frame.phase === "writing"
      ? (frame.fill / 0.8) * (body.length + 4)
      : body.length + 4
    : body.length + 4;
  const bodyShown = Math.min(body.length, Math.max(0, Math.floor(progress)));
  const recallShown = progress >= body.length + 1;
  const explainShown = progress >= body.length + 2;
  const bridgeShown = progress >= body.length + 3;
  const exerciseShown = progress >= body.length + 4;
  const skeletonTail = frontierOpen && !exerciseShown;

  const phaseLine = writing
    ? "Writing the Lessons."
    : frame.phase === "check"
      ? `All ${TOTAL_LESSONS} Lessons are written. The check is running.`
      : frame.phase === "correcting"
        ? "Correcting what the check found."
        : frame.phase === "recheck"
          ? "Re-checking the corrections."
          : `All ${TOTAL_LESSONS} Lessons are written. The Course is ready.`;

  /* The Lesson's position lives at the measure and on the queue's live row;
     the margin carries the measured elapsed and nothing else. */
  const progressLine = `Working for ${formatElapsed(t)}`;

  const writeIn = (key: string, node: ReactNode, extra?: string) => (
    <motion.div
      key={key}
      initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
      animate={reduce ? undefined : { clipPath: "inset(0 0% 0 0)" }}
      transition={{ duration: DUR_WRITE, ease: EASE }}
      className={extra}
    >
      {node}
    </motion.div>
  );

  const pageBlocks: ReactNode[] = [];
  body.slice(0, bodyShown).forEach((block, i) => {
    pageBlocks.push(writeIn(`${corrected ? "c" : "d"}-${i}`, <LessonBlock block={block} />));
  });
  if (recallShown) {
    pageBlocks.push(
      writeIn(
        `${corrected ? "c" : "d"}-recall`,
        <LessonBlock block={{ kind: "note", title: "Recall", text: doc.recall }} />,
      ),
    );
  }
  if (explainShown) {
    pageBlocks.push(
      writeIn(
        `${corrected ? "c" : "d"}-explain`,
        <LessonBlock
          block={{ kind: "note", title: "Explain it to yourself", text: doc.explain }}
        />,
      ),
    );
  }
  if (bridgeShown) {
    pageBlocks.push(
      writeIn(
        `${corrected ? "c" : "d"}-bridge`,
        <LessonBlock block={{ kind: "p", text: doc.bridge }} />,
      ),
    );
  }
  if (exerciseShown) {
    pageBlocks.push(
      writeIn(
        "exercise",
        <section className="max-w-(--measure) border-t border-hair pt-7">
          <h3 className="label text-fg-3">Exercise</h3>
          <p className="mt-3.5 text-[1rem] leading-[1.7] text-fg">
            <Inline text={doc.exercise.task} />
          </p>
          <p className="mt-3 text-[0.9375rem] leading-[1.62] text-fg-3">
            <Inline text={doc.exercise.check} />
          </p>
        </section>,
        "pt-6",
      ),
    );
  }

  const statusLine =
    findingFound && !writing
      ? null
      : frontierOpen
        ? "Being written now."
        : writing
          ? "Draft · the check runs after the last Lesson."
          : frame.phase === "check"
            ? "Draft · the check is running."
            : frame.phase === "correcting"
              ? "Draft · corrections are running."
              : frame.phase === "recheck"
                ? "Checked."
                : "Published in revision 1.";

  const leaveNote = !ready
    ? "You can leave this page. The Course will be here when you come back."
    : null;

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
            {TOPIC}
          </h1>
          <p className="mt-2 text-[0.8125rem] leading-[1.5] text-fg-3">{GOAL}</p>

          <p
            aria-live="polite"
            className="mt-8 flex min-h-[2.6rem] items-end text-[0.9375rem] leading-[1.55] font-medium text-balance text-fg"
          >
            <Settle key={frame.phase}>{phaseLine}</Settle>
          </p>

          <div className="relative mt-4 h-px overflow-hidden bg-hair">
            {!ready &&
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

          <p className="tnum mt-3 text-[0.75rem] leading-[1.5] text-fg-3">{progressLine}</p>

          {!ready && (
            <div className="mt-4">
              <CancelRunButton
                idleLabel="Cancel generation"
                idleIcon={<X className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />}
                confirmLabel="Discard the partial Course?"
                pendingLabel="Discarding…"
                onConfirm={async () => ({ ok: false, reason: "not-found" }) as const}
                onDone={() => {}}
              />
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
                  <Count value={`${writtenCount} of ${TOTAL_LESSONS}`} />
                </p>
              </div>

              <ol className="mt-3 hidden border-t border-hair lg:block">
                {FLAT.map((l) => {
                  const done = readable(l);
                  const doing = writing && frontier !== null && l.id === frontier.id;
                  const current = open.id === l.id;
                  return (
                    <motion.li
                      key={l.id}
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
                        onClick={done ? () => setPinned(l.id) : undefined}
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
                          {l.n}
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
                          {l.title}
                        </span>
                      </Button>
                    </motion.li>
                  );
                })}
              </ol>

              <div
                className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2.5 lg:hidden"
                aria-hidden
              >
                {MODULES.map((m) => {
                  const first = FLAT.find((l) => l.id === m.lessons[0].id)?.n ?? 1;
                  return (
                    <span key={m.id} className="flex items-center gap-x-1">
                      {m.lessons.map((_, li) => {
                        const n = first + li;
                        const done = n <= writtenCount;
                        const frontierTick = writing && n === writtenCount + 1;
                        return (
                          <span key={n} className="flex h-3 w-3 items-center justify-center">
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
                  );
                })}
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
                <p className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
                  <Count value={`${foundCount} of ${FINDINGS.length}`} />
                </p>
              </div>

              {foundCount === 0 ? (
                <p className="mt-3 text-[0.8125rem] leading-[1.5] text-fg-3">Nothing found yet.</p>
              ) : (
                <ul className="mt-3 border-t border-hair">
                  {FINDINGS.slice(0, foundCount).map((f) => {
                    const lesson = FLAT.find((l) => l.id === f.lessonRef) ?? FLAT[FLAT.length - 1];
                    const fixed = fixedIds.has(f.id);
                    const fixing = fixingId === f.id;
                    return (
                      <motion.li
                        key={f.id}
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
                          onClick={() => setPinned(lesson.id)}
                          aria-current={open.id === lesson.id ? "true" : undefined}
                          className={cn(
                            "relative block w-full px-2 py-2.5 text-left",
                            open.id === lesson.id && "bg-raised",
                          )}
                        >
                          <span className="flex items-center gap-x-2">
                            <span className="flex h-4 w-3 shrink-0 items-center justify-center">
                              <Mark state={fixed ? "done" : fixing ? "doing" : "todo"} />
                            </span>
                            <span className="label text-fg-dim">
                              {f.kind === "factual" ? "Accuracy" : "Structure"}
                            </span>
                            <span className="tnum ml-auto shrink-0 text-[0.75rem] leading-[1.5] text-fg-dim">
                              Lesson {lesson.n}
                            </span>
                          </span>
                          <span className="mt-1.5 block text-[0.8125rem] leading-[1.5] text-fg-2">
                            <Inline text={f.text} />
                          </span>
                          <span className="mt-1.5 block text-[0.75rem] leading-[1.5] text-fg-3">
                            <Settle key={fixed ? "fixed" : fixing ? "fixing" : "queued"}>
                              {fixed ? "Fixed." : fixing ? "Fixing now." : "Queued for correction."}
                            </Settle>
                          </span>
                        </Button>
                      </motion.li>
                    );
                  })}
                </ul>
              )}

              {ready && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR_SETTLE, ease: EASE }}
                  className="mt-7"
                >
                  <p className="text-[0.8125rem] leading-[1.5] text-fg-2">
                    Published as revision 1. Every Lesson passed the check.
                  </p>
                  <Button render={<Link href="/courses" />} className="mt-4">
                    Open the Course
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}

          {leaveNote && (
            <p className="mt-auto pt-8 max-w-[19rem] text-[0.75rem] leading-[1.5] text-fg-3">
              {leaveNote}
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
                      <Settle key={frame.phase} className="inline">
                        {frontier ? (
                          <>
                            Writing now · Lesson {frontier.n}:{" "}
                            <span className="text-fg-2">{frontier.title}</span>
                          </>
                        ) : frame.phase === "check" ? (
                          "The check is running"
                        ) : frame.phase === "correcting" ? (
                          "Correcting what the check found"
                        ) : frame.phase === "recheck" ? (
                          "Re-checking the corrections"
                        ) : (
                          "Every Lesson passed the check"
                        )}
                      </Settle>
                    </p>
                    <Button variant="quiet" className="shrink-0" onClick={() => setPinned(null)}>
                      {frontier ? "Return to writing" : "Return to the run"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            key={open.id}
            initial={reduce ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR_TURN, ease: EASE }}
          >
            <AnimatePresence initial={false}>
              {finding && findingFound && !writing && (
                <motion.div
                  key={finding.id}
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduce ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: DUR_SETTLE, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="pb-8">
                    <div className="border-b border-hair pb-4">
                      {/* While the run still owes this page work — queued or being
                          fixed — the strip's own line carries the accent and the
                          live mark, and the fix in flight is written in the accent
                          too; the moment it lands, all three go quiet. */}
                      <p className={cn("label min-h-3", corrected ? "text-fg-dim" : "text-live")}>
                        <Settle
                          key={corrected ? "fixed" : "checking"}
                          className="inline-flex items-center gap-2"
                        >
                          {!corrected && <LiveMark />}
                          The check · {finding.kind === "factual" ? "Accuracy" : "Structure"}
                        </Settle>
                      </p>
                      <p className="mt-2 max-w-(--measure) text-[0.8125rem] leading-[1.5] text-fg-2">
                        <Inline text={finding.text} />
                      </p>
                      <p className="mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
                        <Settle
                          key={corrected ? "fixed" : fixingId === finding.id ? "fixing" : "queued"}
                          className="inline-flex items-center gap-2"
                        >
                          {corrected ? (
                            <>
                              <span className="text-fg-2">
                                <DoneCheck />
                              </span>
                              Fixed in this round.
                            </>
                          ) : fixingId === finding.id ? (
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
              Lesson {open.n} of {TOTAL_LESSONS}
            </p>

            <h2 className="mt-2.5 max-w-[22ch] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance text-fg sm:text-[2.25rem]">
              {open.title}
            </h2>

            {statusLine && (
              <p className="mt-3 text-[0.75rem] leading-[1.5] text-fg-3">{statusLine}</p>
            )}
          </motion.div>

          <div className="mt-9 space-y-6">
            {pageBlocks}
            {skeletonTail && <SkeletonTail />}
          </div>
        </article>

        <div className="mx-auto mt-14 w-full max-w-[41rem] px-5 pb-28 sm:px-8 lg:hidden">
          <div className="flex items-baseline justify-between gap-3 border-b border-hair pb-2">
            <p className="label text-fg-3">Written</p>
            <p className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
              {writtenCount} of {TOTAL_LESSONS}
            </p>
          </div>
          <WrittenList
            items={FLAT.slice(0, writtenCount)}
            openId={open.id}
            onOpen={setPinned}
            touch
          />
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
              <Count value={`${writtenCount} of ${TOTAL_LESSONS}`} />
            </p>
          </div>
          <WrittenList items={FLAT.slice(0, writtenCount)} openId={open.id} onOpen={setPinned} />
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
      {items.map((l) => (
        <WrittenRow
          key={l.id}
          lesson={l}
          open={l.id === openId}
          onOpen={() => onOpen(l.id)}
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
