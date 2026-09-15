"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MotionConfig, Reorder, motion, useDragControls, type DragControls } from "motion/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Scissors,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/workspace/hint";
import { CancelRunButton } from "@/components/cancel-run-button";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TailorConversation } from "@/components/tailor-conversation";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { field } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { useStickyFollow } from "@/hooks/use-sticky-follow";
import {
  DRAFTED_IN,
  GOAL,
  LESSON_WRITE_MS,
  MODULES,
  PLAN_ID,
  PLAN_OPERATIONS,
  SCRIPTED_REPLIES,
  SOURCES,
  START_DELAY_MS,
  TAILOR_TURNS,
  TOPIC,
  WHY,
  type MockEffect,
  type MockLesson,
  type MockModule,
  type MockOperation,
} from "./fixture";

const EASE = [0.2, 0, 0, 1] as const;

/* The rename input replaces a line of text without changing the row's height:
   same leading as the text it stands in for, no vertical padding. */
const renameField = "bg-panel text-fg outline-none transition-colors focus:bg-raised";

type Phase = "review" | "writing";
type MockPlan = { id: string; operations: MockOperation[] };

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function roman(n: number): string {
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rest = n;
  let out = "";
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out || "I";
}

function chunkText(text: string, size = 3): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/* The fixture streams the way the route does: the same UI message chunks a
   `useChat` client reads from SSE, with no network behind them. */
function mockTailorTransport(
  onReply: (reply: (typeof SCRIPTED_REPLIES)[number]) => void,
): ChatTransport<UIMessage> {
  let asked = 0;
  return {
    async sendMessages({ abortSignal }) {
      const reply = SCRIPTED_REPLIES[Math.min(asked, SCRIPTED_REPLIES.length - 1)];
      asked += 1;
      const id = uid("reply");
      return new ReadableStream<UIMessageChunk>({
        async start(controller) {
          const abort = () => controller.error(new DOMException("Aborted", "AbortError"));
          abortSignal?.addEventListener("abort", abort, { once: true });
          controller.enqueue({ type: "start" });
          controller.enqueue({ type: "text-start", id });
          await sleep(650);
          for (const chunk of chunkText(reply.text)) {
            if (abortSignal?.aborted) return;
            controller.enqueue({ type: "text-delta", id, delta: chunk });
            await sleep(18);
          }
          controller.enqueue({ type: "text-end", id });
          controller.enqueue({ type: "finish" });
          controller.close();
          onReply(reply);
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}

function cloneModules(mods: MockModule[]): MockModule[] {
  return mods.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l })) }));
}

/* Applying an accepted Change plan: the register is the only copy, so the
   operations act on it directly. */
function applyEffect(mods: MockModule[], effect: MockEffect, touched: string[]): MockModule[] {
  if (effect.kind === "retitle") {
    touched.push(effect.lessonId);
    return mods.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) =>
        l.id === effect.lessonId ? { ...l, title: effect.title, summary: effect.summary } : l,
      ),
    }));
  }

  return mods.map((m) => {
    if (m.id !== effect.moduleId) return m;
    const index = m.lessons.findIndex((l) => l.id === effect.afterLessonId);
    const lesson: MockLesson = {
      id: uid("l"),
      title: effect.title,
      summary: effect.summary,
    };
    touched.push(lesson.id);
    const lessons = [...m.lessons];
    lessons.splice(index + 1, 0, lesson);
    return { ...m, lessons };
  });
}

export function LedgerMock() {
  const [modules, setModules] = useState<MockModule[]>(() =>
    MODULES.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l })) })),
  );
  const [phase, setPhase] = useState<Phase>("review");
  const [written, setWritten] = useState(0);
  const [edits, setEdits] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<MockLesson | null>(null);
  const [plan, setPlan] = useState<MockPlan | null>({ id: PLAN_ID, operations: PLAN_OPERATIONS });
  const [flash, setFlash] = useState<string[]>([]);

  /* A scripted reply can carry a proposed operation, exactly as a real plan
     arrives through the tool result. */
  const transport = useMemo(
    () =>
      mockTailorTransport((reply) => {
        if (!reply.operation) return;
        const operation = reply.operation;
        setPlan((current) =>
          current
            ? { ...current, operations: [...current.operations, operation] }
            : { id: PLAN_ID, operations: [operation] },
        );
      }),
    [],
  );

  const reduce = usePrefersReducedMotion();
  const tailorRef = useRef<HTMLElement | null>(null);
  const registerRef = useRef<HTMLDivElement | null>(null);
  const reorderStart = useRef<{ moduleId: string; ids: string } | null>(null);
  useStickyFollow(tailorRef);

  const numbered = useMemo(() => {
    let n = 0;
    return modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, n: ++n })) }));
  }, [modules]);

  const lessonCount = useMemo(
    () => modules.reduce((sum, m) => sum + m.lessons.length, 0),
    [modules],
  );

  /* The run is finished once every Lesson is written; it is a fact about
     `written`, not a phase of its own. */
  const done = phase === "writing" && written >= lessonCount;

  /* The writing run advances by itself: one Lesson every beat. */
  useEffect(() => {
    if (phase !== "writing" || written >= lessonCount) return;
    const timer = window.setTimeout(
      () => setWritten((n) => n + 1),
      written === 0 ? START_DELAY_MS : LESSON_WRITE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, written, lessonCount]);

  /* The changed rows hold a highlight for a beat after the plan applies. */
  useEffect(() => {
    if (flash.length === 0) return;
    const timer = window.setTimeout(() => setFlash([]), 900);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function approve() {
    setWritten(0);
    setPhase("writing");
  }

  /* Watch the run from its start rather than from the footbar that started it;
     the run's status line stays in view. */
  useEffect(() => {
    if (phase !== "writing") return;
    const scroller = registerRef.current?.closest("main");
    scroller?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [phase, reduce]);

  function rename(id: string, value: string) {
    const next = value.trim();
    setEditing(null);
    if (!next) return;

    const lesson = modules.flatMap((m) => m.lessons).find((l) => l.id === id);
    if (lesson) {
      if (lesson.title === next) return;
      setModules((mods) =>
        mods.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) => (l.id === id ? { ...l, title: next } : l)),
        })),
      );
      setEdits((n) => n + 1);
      return;
    }

    const mod = modules.find((m) => m.id === id);
    if (mod && mod.title !== next) {
      setModules((mods) => mods.map((m) => (m.id === id ? { ...m, title: next } : m)));
      setEdits((n) => n + 1);
    }
  }

  function moveLesson(moduleId: string, index: number, delta: number) {
    setModules((mods) =>
      mods.map((m) => {
        if (m.id !== moduleId) return m;
        const to = index + delta;
        if (to < 0 || to >= m.lessons.length) return m;
        const lessons = [...m.lessons];
        const [lesson] = lessons.splice(index, 1);
        lessons.splice(to, 0, lesson);
        return { ...m, lessons };
      }),
    );
    setEdits((n) => n + 1);
  }

  function moveModule(index: number, delta: number) {
    setModules((mods) => {
      const to = index + delta;
      if (to < 0 || to >= mods.length) return mods;
      const next = [...mods];
      const [mod] = next.splice(index, 1);
      next.splice(to, 0, mod);
      return next;
    });
    setEdits((n) => n + 1);
  }

  function removeLesson(lessonId: string) {
    setModules((mods) =>
      mods.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) })),
    );
    setEdits((n) => n + 1);
  }

  function removeModule(moduleId: string) {
    setModules((mods) => mods.filter((m) => m.id !== moduleId));
    setEdits((n) => n + 1);
  }

  function addLesson(moduleId: string) {
    setModules((mods) =>
      mods.map((m) =>
        m.id === moduleId
          ? {
              ...m,
              lessons: [
                ...m.lessons,
                {
                  id: uid("l"),
                  title: "Untitled Lesson",
                  summary: "Say what this one is for.",
                },
              ],
            }
          : m,
      ),
    );
    setEdits((n) => n + 1);
  }

  function addModule() {
    setModules((mods) => [...mods, { id: uid("m"), title: "Untitled Module", lessons: [] }]);
    setEdits((n) => n + 1);
  }

  function splitLesson(lessonId: string, secondTitle: string, secondSummary: string) {
    setModules((mods) =>
      mods.map((m) => {
        const index = m.lessons.findIndex((l) => l.id === lessonId);
        if (index < 0) return m;
        const second: MockLesson = {
          id: uid("l"),
          title: secondTitle,
          summary: secondSummary,
        };
        return {
          ...m,
          lessons: [
            ...m.lessons.slice(0, index),
            m.lessons[index],
            second,
            ...m.lessons.slice(index + 1),
          ],
        };
      }),
    );
    setEdits((n) => n + 1);
  }

  /* Reorder hands back the new value order; the register only needs the ids.
     The change is counted once, when the drag ends, not at every position. */
  function reorderLessons(moduleId: string, lessonIds: string[]) {
    setModules((mods) =>
      mods.map((m) => {
        if (m.id !== moduleId) return m;
        const byId = new Map(m.lessons.map((l) => [l.id, l]));
        return {
          ...m,
          lessons: lessonIds.flatMap((id) => {
            const lesson = byId.get(id);
            return lesson ? [lesson] : [];
          }),
        };
      }),
    );
  }

  function beginReorder(moduleId: string, lessonIds: string[]) {
    reorderStart.current = { moduleId, ids: lessonIds.join() };
  }

  function endReorder(moduleId: string) {
    const start = reorderStart.current;
    reorderStart.current = null;
    if (!start || start.moduleId !== moduleId) return;
    const current = modules.find((m) => m.id === moduleId);
    if (!current || current.lessons.map((l) => l.id).join() === start.ids) return;
    setEdits((n) => n + 1);
  }

  function statusOperation(operationId: string, status: "discarded" | "proposed") {
    setPlan((current) =>
      current
        ? {
            ...current,
            operations: current.operations.map((o) =>
              o.id === operationId ? { ...o, status } : o,
            ),
          }
        : current,
    );
  }

  /* Accepting is applying: the change lands on the register at once, and the
     snapshot taken before it is the Undo. */
  /* The plan is the unit of consent: applying lands every row still standing. */
  function applyAllOperations() {
    if (!plan) return;
    const proposed = plan.operations.filter((o) => o.status !== "discarded");
    if (proposed.length === 0) return;
    const touched: string[] = [];
    let next = cloneModules(modules);
    for (const operation of proposed) {
      next = applyEffect(next, operation.effect, touched);
    }
    setModules(next);
    setPlan(null);
    setEdits((n) => n + proposed.length);
    setFlash(touched);
  }

  /* One bar per breakpoint: inside the register column on wide screens, and
     after the Tailor on small ones so the commit follows the whole page. */
  const footbar = (visibility: string) => (
    <div className={cn("sticky bottom-0 mt-10 border-t border-hair bg-canvas py-4", visibility)}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {phase === "review" ? (
          <>
            <Button onClick={approve}>Generate the Lessons</Button>
            <p className="tnum text-[0.75rem] leading-[1.5] text-fg-3">
              <Count value={`${modules.length} Modules`} />
              <span className="text-fg-dim"> · </span>
              <Count value={`${lessonCount} Lessons`} />
            </p>
            <p className="tnum text-[0.75rem] text-fg-3">
              {edits > 0
                ? `${edits} ${edits === 1 ? "change" : "changes"} saved`
                : "No changes yet"}
            </p>
          </>
        ) : (
          <>
            <p aria-live="polite" className="tnum text-[0.75rem] leading-[1.5] text-fg-3">
              <Count value={`${written} of ${lessonCount} Lessons written`} />
            </p>
            {!done && (
              <div>
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
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[96rem] px-5 sm:px-8">
      <motion.div
        className="flex flex-col lg:flex-row lg:gap-10"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE }}
      >
        <div className="min-w-0 flex-1 pt-10">
          <div className="mb-7">
            <Button variant="quiet" render={<Link href="/courses" />} className="group -ml-1">
              <ArrowLeft
                className="h-3.5 w-3.5 shrink-0 transition-transform duration-120 ease-expo group-hover:-translate-x-1"
                strokeWidth={1.75}
              />
              Back to Courses
            </Button>
          </div>
          <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
            {TOPIC}
          </h1>
          <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">{GOAL}</p>

          {phase === "review" ? (
            <p className="tnum mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
              Drafted in {DRAFTED_IN}
            </p>
          ) : (
            <div className="mt-4">
              <p
                aria-live="polite"
                className="max-w-(--measure) text-[0.9375rem] leading-[1.6] text-fg-2"
              >
                {done
                  ? `All ${lessonCount} Lessons are written. The Course is ready.`
                  : `Generating all ${lessonCount} Lessons in one pass, against the shape you just approved.`}
              </p>
              {!done && (
                <p className="tnum mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
                  Lesson {Math.min(written + 1, lessonCount)} of {lessonCount}.
                </p>
              )}
              <p className="mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
                You can leave this page. The Course will be here when you come back.
              </p>
            </div>
          )}

          <div ref={registerRef} className="mt-8 scroll-mt-6">
            {numbered.map((m, mi) => {
              return (
                <section key={m.id} className="mb-6 last:mb-0">
                  <div className="group/mod flex items-center justify-between gap-3 border-b border-hair pb-2">
                    {editing === m.id ? (
                      <RenameInput
                        initial={m.title}
                        label="Module title"
                        className={`${renameField} label min-w-0 flex-1 px-1.5 py-0`}
                        onCommit={(value) => rename(m.id, value)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : phase === "review" ? (
                      <Hint label="Rename this Module">
                        <Button
                          variant="bare"
                          onClick={() => setEditing(m.id)}
                          className="label block truncate text-fg-3"
                        >
                          {roman(mi + 1)}. {m.title}
                        </Button>
                      </Hint>
                    ) : (
                      <span className="label block truncate text-fg-3">
                        {roman(mi + 1)}. {m.title}
                      </span>
                    )}

                    <span className="flex shrink-0 items-center gap-x-3">
                      <span className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
                        {m.lessons.length} {m.lessons.length === 1 ? "Lesson" : "Lessons"}
                      </span>
                      {phase === "review" && (
                        <span className="hidden items-center sm:flex sm:opacity-0 sm:group-hover/mod:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100!">
                          <RowAction
                            label={`Move ${m.title} up`}
                            title="Move this Module up"
                            onClick={() => moveModule(mi, -1)}
                            disabled={mi === 0}
                            className="p-1 disabled:opacity-20"
                          >
                            <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </RowAction>
                          <RowAction
                            label={`Move ${m.title} down`}
                            title="Move this Module down"
                            onClick={() => moveModule(mi, 1)}
                            disabled={mi === numbered.length - 1}
                            className="p-1 disabled:opacity-20"
                          >
                            <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </RowAction>
                          <RowAction
                            label={`Remove ${m.title}`}
                            title="Remove this Module and its Lessons"
                            onClick={() => removeModule(m.id)}
                            className="p-1"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </RowAction>
                        </span>
                      )}
                      {phase === "review" && (
                        <RowMenu
                          label="Module actions"
                          items={[
                            {
                              key: "rename",
                              label: "Rename",
                              icon: <Pencil strokeWidth={1.75} />,
                              onSelect: () => setEditing(m.id),
                            },
                            {
                              key: "up",
                              label: "Move up",
                              icon: <ArrowUp strokeWidth={1.75} />,
                              onSelect: () => moveModule(mi, -1),
                              disabled: mi === 0,
                            },
                            {
                              key: "down",
                              label: "Move down",
                              icon: <ArrowDown strokeWidth={1.75} />,
                              onSelect: () => moveModule(mi, 1),
                              disabled: mi === numbered.length - 1,
                            },
                            {
                              key: "remove",
                              label: "Remove Module",
                              icon: <X strokeWidth={1.75} />,
                              onSelect: () => removeModule(m.id),
                            },
                          ]}
                        />
                      )}
                    </span>
                  </div>

                  <MotionConfig reducedMotion={reduce ? "always" : "never"}>
                    <Reorder.Group
                      as="ul"
                      axis="y"
                      values={m.lessons}
                      onReorder={(next) =>
                        reorderLessons(
                          m.id,
                          next.map((l) => l.id),
                        )
                      }
                    >
                      {m.lessons.map((l, li) => {
                        const rowDone = phase !== "review" && l.n <= written;
                        const doing = phase === "writing" && l.n === written + 1;
                        return (
                          <DragRow
                            key={l.id}
                            value={l}
                            current={doing ? "true" : undefined}
                            onDragStart={() =>
                              beginReorder(
                                m.id,
                                m.lessons.map((x) => x.id),
                              )
                            }
                            onDragEnd={() => endReorder(m.id)}
                            className={cn(
                              "group row grid grid-cols-[1.25rem_1.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-hair px-2 py-2.5 transition-colors duration-500 hover:bg-panel",
                              flash.includes(l.id) && "bg-panel",
                            )}
                          >
                            {(controls) => (
                              <>
                                <span className="flex h-4 w-5 items-center justify-center text-fg-3">
                                  {phase === "review" ? (
                                    <Hint label="Drag to reorder">
                                      <Button
                                        variant="icon-raised"
                                        aria-label={`Reorder ${l.title}`}
                                        className="cursor-grab touch-none p-0.5 text-fg-dim active:cursor-grabbing"
                                        onPointerDown={(event) => controls.start(event)}
                                        onKeyDown={(event) => {
                                          if (event.key === "ArrowUp") {
                                            event.preventDefault();
                                            moveLesson(m.id, li, -1);
                                          }
                                          if (event.key === "ArrowDown") {
                                            event.preventDefault();
                                            moveLesson(m.id, li, 1);
                                          }
                                        }}
                                      >
                                        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
                                      </Button>
                                    </Hint>
                                  ) : rowDone ? (
                                    <DoneCheck striking />
                                  ) : doing ? (
                                    <LiveMark />
                                  ) : (
                                    <UnsetMark />
                                  )}
                                </span>

                                <span className="tnum text-[0.75rem] leading-5 text-fg-dim">
                                  {l.n}
                                </span>

                                <span className="min-w-0 lg:flex lg:items-baseline lg:gap-x-3">
                                  {editing === l.id ? (
                                    <RenameInput
                                      initial={l.title}
                                      label="Lesson title"
                                      className={`${renameField} w-full px-1.5 py-0 text-[0.8125rem] leading-5 lg:w-[18rem] lg:shrink-0`}
                                      onCommit={(value) => rename(l.id, value)}
                                      onCancel={() => setEditing(null)}
                                    />
                                  ) : phase === "review" ? (
                                    <Hint label="Rename this Lesson">
                                      <Button
                                        variant="bare"
                                        onClick={() => setEditing(l.id)}
                                        className="block max-w-full truncate text-left text-[0.8125rem] leading-5 font-medium text-fg lg:w-[18rem] lg:shrink-0"
                                      >
                                        {l.title}
                                      </Button>
                                    </Hint>
                                  ) : (
                                    <span
                                      className={cn(
                                        "block truncate text-[0.8125rem] leading-5 lg:w-[18rem] lg:shrink-0",
                                        doing ? "font-medium text-fg" : "text-fg-2",
                                      )}
                                    >
                                      {l.title}
                                    </span>
                                  )}
                                  <span className="mt-0.5 block truncate text-[0.8125rem] leading-[1.5] text-fg-3 lg:mt-0 lg:min-w-0 lg:flex-1">
                                    {l.summary}
                                  </span>
                                </span>

                                {phase === "review" ? (
                                  <>
                                    <span className="hidden items-center justify-end sm:flex sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100!">
                                      <RowAction
                                        label={`Move ${l.title} up`}
                                        title="Move this Lesson up"
                                        onClick={() => moveLesson(m.id, li, -1)}
                                        disabled={li === 0}
                                        className="p-1 disabled:opacity-20"
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                                      </RowAction>
                                      <RowAction
                                        label={`Move ${l.title} down`}
                                        title="Move this Lesson down"
                                        onClick={() => moveLesson(m.id, li, 1)}
                                        disabled={li === m.lessons.length - 1}
                                        className="p-1 disabled:opacity-20"
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                                      </RowAction>
                                      <RowAction
                                        label={`Split ${l.title}`}
                                        title="Split this Lesson in two"
                                        onClick={() => setSplitting(l)}
                                        className="p-1"
                                      >
                                        <Scissors className="h-3.5 w-3.5" strokeWidth={1.75} />
                                      </RowAction>
                                      <RowAction
                                        label={`Remove ${l.title}`}
                                        title="Remove this Lesson"
                                        onClick={() => removeLesson(l.id)}
                                        className="p-1"
                                      >
                                        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                                      </RowAction>
                                    </span>
                                    <RowMenu
                                      label={`Actions for ${l.title}`}
                                      items={[
                                        {
                                          key: "rename",
                                          label: "Rename",
                                          icon: <Pencil strokeWidth={1.75} />,
                                          onSelect: () => setEditing(l.id),
                                        },
                                        {
                                          key: "up",
                                          label: "Move up",
                                          icon: <ArrowUp strokeWidth={1.75} />,
                                          onSelect: () => moveLesson(m.id, li, -1),
                                          disabled: li === 0,
                                        },
                                        {
                                          key: "down",
                                          label: "Move down",
                                          icon: <ArrowDown strokeWidth={1.75} />,
                                          onSelect: () => moveLesson(m.id, li, 1),
                                          disabled: li === m.lessons.length - 1,
                                        },
                                        {
                                          key: "split",
                                          label: "Split in two",
                                          icon: <Scissors strokeWidth={1.75} />,
                                          onSelect: () => setSplitting(l),
                                        },
                                        {
                                          key: "remove",
                                          label: "Remove Lesson",
                                          icon: <X strokeWidth={1.75} />,
                                          onSelect: () => removeLesson(l.id),
                                        },
                                      ]}
                                    />
                                  </>
                                ) : (
                                  <span
                                    className={cn(
                                      "text-[0.75rem] leading-[1.5]",
                                      doing ? "text-fg-2" : "text-fg-3",
                                    )}
                                  >
                                    {rowDone ? "Done" : doing ? "Doing" : "Queued"}
                                  </span>
                                )}
                              </>
                            )}
                          </DragRow>
                        );
                      })}
                    </Reorder.Group>
                  </MotionConfig>

                  {phase === "review" && (
                    <Button variant="quiet" onClick={() => addLesson(m.id)} className="mt-2.5 ml-2">
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Add a Lesson
                    </Button>
                  )}
                </section>
              );
            })}

            {phase === "review" && (
              <Button variant="quiet" onClick={addModule} className="mt-2">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add a Module
              </Button>
            )}
          </div>

          <section className="mt-14 border-t border-hair pt-6">
            <h2 className="label text-fg-3">Sources</h2>
            <ul className="mt-3 grid gap-x-10 sm:grid-cols-2 2xl:grid-cols-4">
              {SOURCES.map((s) => (
                <li key={s.url} className="border-b border-hair py-2.5">
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
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-14 border-t border-hair pt-6">
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
          </section>

          {footbar("hidden lg:block")}
        </div>

        {phase === "review" && (
          <aside
            ref={tailorRef}
            className="w-full shrink-0 border-t border-hair pt-8 pb-20 lg:sticky lg:top-0 lg:w-[20rem] lg:self-start lg:border-t-0 lg:border-l lg:pt-10 lg:pb-2 lg:pl-8"
          >
            <h2 className="label text-fg-3">Tailor</h2>
            <p className="mt-2 text-[0.8125rem] leading-[1.6] text-fg-3">
              Nothing is written until you apply it.
            </p>
            <div className="mt-5">
              <TailorConversation
                chatId="mock-outline-tailor"
                transport={transport}
                turns={TAILOR_TURNS}
                plan={plan ?? undefined}
                onApply={applyAllOperations}
                onDiscard={(id) => statusOperation(id, "discarded")}
                onRestore={(id) => statusOperation(id, "proposed")}
                scrollport={false}
              />
            </div>
          </aside>
        )}

        {footbar("lg:hidden")}
      </motion.div>

      {splitting && (
        <SplitDialog
          key={splitting.id}
          onClose={() => setSplitting(null)}
          onSplit={(secondTitle, secondSummary) => {
            splitLesson(splitting.id, secondTitle, secondSummary);
            setSplitting(null);
          }}
        />
      )}
    </div>
  );
}

/* Reorder drag controls come from a hook, one per row; this wrapper owns the
   hook and hands the controls to the grip in the row's left gutter. */
function DragRow({
  value,
  current,
  onDragStart,
  onDragEnd,
  className,
  children,
}: {
  value: MockLesson;
  current?: "true";
  onDragStart?: () => void;
  onDragEnd?: () => void;
  className: string;
  children: (controls: DragControls) => React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="li"
      value={value}
      aria-current={current}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={className}
    >
      {children(controls)}
    </Reorder.Item>
  );
}

function RowAction({
  label,
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Hint label={title}>
      <Button
        variant="icon-raised"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={className}
      >
        {children}
      </Button>
    </Hint>
  );
}

function RowMenu({
  label,
  items,
}: {
  label: string;
  items: {
    key: string;
    label: string;
    icon: React.ReactNode;
    onSelect: () => void;
    disabled?: boolean;
  }[];
}) {
  return (
    <DropdownMenu>
      <Hint label={label}>
        <DropdownMenuTrigger
          render={
            <Button variant="icon-raised" aria-label={label} className="p-1 sm:hidden">
              <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Button>
          }
        />
      </Hint>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            onClick={item.onSelect}
            disabled={item.disabled}
            className="py-2.5"
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenameInput({
  initial,
  label,
  className,
  onCommit,
  onCancel,
}: {
  initial: string;
  label: string;
  className: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      defaultValue={initial}
      aria-label={label}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(e.currentTarget.value);
        if (e.key === "Escape") onCancel();
      }}
      className={className}
    />
  );
}

/* A figure that settles when it changes: the totals are the page's argument,
   so they move when a change lands. */
function Count({ value, className }: { value: string; className?: string }) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.span
      key={value}
      initial={reduce ? false : { opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
      className={cn("inline-block", className)}
    >
      {value}
    </motion.span>
  );
}

function SplitDialog({
  onClose,
  onSplit,
}: {
  onClose: () => void;
  onSplit: (secondTitle: string, secondSummary: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");

  const ready = title.trim().length > 0 && summary.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[26rem]">
        <DialogHeader>
          <DialogTitle>Split this Lesson</DialogTitle>
          <DialogDescription>
            The first half keeps its title. What is the second half?
          </DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Second half's title"
          aria-label="Second half's title"
          className={`${field} w-full`}
        />
        <Textarea
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One sentence on what it gets the learner."
          aria-label="Second half's summary"
        />
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSplit(title.trim(), summary.trim())} disabled={!ready}>
            Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
