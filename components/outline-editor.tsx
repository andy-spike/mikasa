"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { applyOutlineOpAction, approveOutlineAction } from "@/lib/actions/outline";
import {
  acceptProposedOperationsAction,
  applyPlanToOutlineAction,
  reviewTailorOperationAction,
} from "@/lib/actions/tailor";
import type { SourceLink } from "@/lib/course/reading";
import type { OutlineOp } from "@/lib/course/structure";
import type { OutlineEditorCourse } from "@/lib/course/view";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useStickyFollow } from "@/hooks/use-sticky-follow";
import { useSyncedState } from "@/hooks/use-synced-state";
import { field } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { TailorConversation, type PlanView, type Turn } from "./tailor-conversation";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Textarea } from "./ui/textarea";
import { Hint } from "./workspace/hint";

const EASE = [0.2, 0, 0, 1] as const;

/* The rename input replaces a line of text without changing the row's height:
   same leading as the text it stands in for, no vertical padding. */
const renameField = "bg-panel text-fg outline-none transition-colors focus:bg-raised";

type Module = OutlineEditorCourse["modules"][number];
type Lesson = Module["lessons"][number];

/** The Course's own evidence for its shape; Why this shape reads from it. */
export type OutlineEvidence = {
  terminalPerformances: string[];
  premise: string | null;
  runningExample: string | null;
};

type Props = {
  course: OutlineEditorCourse;
  /** The Sources the design consulted. Omitted when the Course has none. */
  sources?: SourceLink[];
  /** Why this shape. Null, or absent, when the Outline has no specification. */
  spec?: OutlineEvidence | null;
  /** The measured design run, for example "1m 52s". Omitted when unknown. */
  draftedIn?: string | null;
  tailorTurns?: Turn[];
  tailorPlan?: PlanView | null;
  onRefreshPlan?: () => Promise<PlanView | null>;
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* A plan applies on the server, so the changed rows arrive with the refreshed
   Outline; they hold a highlight for a beat, as the mock's register does. */
function changedLessonIds(before: Module[], after: Module[]): string[] {
  const previous = new Map(before.flatMap((m) => m.lessons).map((l) => [l.id, l]));
  const changed: string[] = [];
  for (const lesson of after.flatMap((m) => m.lessons)) {
    const was = previous.get(lesson.id);
    if (!was || was.title !== lesson.title || was.summary !== lesson.summary) {
      changed.push(lesson.id);
    }
  }
  return changed;
}

export function OutlineEditor({
  course,
  sources,
  spec,
  draftedIn,
  tailorTurns,
  tailorPlan,
  onRefreshPlan,
}: Props) {
  const router = useRouter();
  const tailorRef = useRef<HTMLElement | null>(null);
  useStickyFollow(tailorRef);
  const [modules, setModules] = useState<Module[]>(course.modules);
  const [version, setVersion] = useState(course.version);
  const [edits, setEdits] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<Lesson | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const [plan, setPlan] = useSyncedState(tailorPlan);

  const [adopted, setAdopted] = useState(course.version);
  if (course.version !== adopted) {
    setAdopted(course.version);
    setFlash(changedLessonIds(modules, course.modules));
    setModules(course.modules);
    setVersion(course.version);
    setError(null);
  }

  const lessons = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const numbered = useMemo(() => {
    let n = 0;
    return modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, n: ++n })) }));
  }, [modules]);

  const lessonCount = lessons.length;
  const whyThisShape =
    spec && (spec.terminalPerformances.length > 0 || spec.premise || spec.runningExample)
      ? spec
      : null;

  /* The changed rows hold a highlight for a beat after the plan applies. */
  useEffect(() => {
    if (flash.length === 0) return;
    const timer = window.setTimeout(() => setFlash([]), 900);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function failWith(message: string, reason: string) {
    setError(message);
    if (reason === "conflict") router.refresh();
  }

  function submit(work: () => Promise<void>) {
    setError(null);
    startTransition(work);
  }

  function run(op: OutlineOp) {
    submit(async () => {
      const result = await applyOutlineOpAction(course.id, version, op);
      if (result.ok) {
        setModules(result.outline.data.modules);
        setVersion(result.outline.version);
        setEdits((n) => n + 1);
      } else {
        failWith(result.message, result.reason);
      }
    });
  }

  function approve() {
    submit(async () => {
      const result = await approveOutlineAction(course.id, version);
      if (result.ok) router.refresh();
      else failWith(result.message, result.reason);
    });
  }

  async function tailorFinished() {
    if (onRefreshPlan) setPlan(await onRefreshPlan());
  }

  async function reviewOperation(operationId: string, status: "discarded" | "proposed") {
    if (!plan) return;
    const result = await reviewTailorOperationAction(plan.id, operationId, status);
    if (result.ok) {
      setPlan({
        ...plan,
        operations: plan.operations.map((operation) =>
          operation.id === operationId ? { ...operation, status } : operation,
        ),
      });
    } else {
      if (onRefreshPlan) setPlan(await onRefreshPlan());
    }
  }

  function applyPlan() {
    if (!plan) return;
    const planId = plan.id;
    submit(async () => {
      const accepted = await acceptProposedOperationsAction(planId);
      if (!accepted.ok) {
        if (onRefreshPlan) setPlan(await onRefreshPlan());
        failWith(accepted.message ?? "The plan could not be accepted.", "invalid");
        return;
      }
      const result = await applyPlanToOutlineAction(course.id, planId);
      if (result.ok) {
        setEdits((n) => n + result.appliedCount);
        setPlan(null);
        router.refresh();
      } else {
        failWith(result.message, result.reason);
      }
    });
  }

  function commitRename(id: string, value: string) {
    const next = value.trim();
    setEditing(null);
    if (!next) return;
    const lesson = lessons.find((l) => l.id === id);
    if (lesson) {
      if (next !== lesson.title) {
        run({ kind: "renameLesson", lessonId: id, title: next, summary: lesson.summary });
      }
      return;
    }
    const mod = modules.find((m) => m.id === id);
    if (mod && next !== mod.title) run({ kind: "renameModule", moduleId: id, title: next });
  }

  function moveLesson(moduleId: string, lessonId: string, toIndex: number) {
    if (pending) return;
    run({ kind: "moveLesson", lessonId, toModuleId: moduleId, toIndex });
  }

  /* Reorder hands back the new value order mid-drag, so the register renumbers
     in place; the change is committed once, on drag end, as one moveLesson. */
  const reorderStart = useRef<{ moduleId: string; ids: string[]; next: string[] } | null>(null);

  function trackReorder(moduleId: string, lessonIds: string[]) {
    const start = reorderStart.current;
    if (start && start.moduleId === moduleId) start.next = lessonIds;
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
    reorderStart.current = { moduleId, ids: lessonIds, next: lessonIds };
  }

  function endReorder(moduleId: string) {
    const start = reorderStart.current;
    reorderStart.current = null;
    if (!start || start.moduleId !== moduleId) return;
    const ids = start.next;
    if (ids.join() === start.ids.join()) return;
    const moved = ids.find(
      (id) => ids.filter((x) => x !== id).join() === start.ids.filter((x) => x !== id).join(),
    );
    if (!moved) return;
    run({
      kind: "moveLesson",
      lessonId: moved,
      toModuleId: moduleId,
      toIndex: ids.indexOf(moved),
    });
  }

  /* One bar per breakpoint: inside the register column on wide screens, and
     after the Tailor on small ones so the commit follows the whole page. */
  const footbar = (visibility: string) => (
    <div className={cn("sticky bottom-0 mt-10 border-t border-hair bg-canvas py-4", visibility)}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button onClick={approve} disabled={pending}>
          Generate the Lessons
        </Button>
        <p className="tnum text-[0.75rem] leading-[1.5] text-fg-3">
          <Count value={`${modules.length} ${modules.length === 1 ? "Module" : "Modules"}`} />
          <span className="text-fg-dim"> · </span>
          <Count value={`${lessonCount} ${lessonCount === 1 ? "Lesson" : "Lessons"}`} />
        </p>
        <p className="tnum text-[0.75rem] text-fg-3">
          {edits > 0 ? `${edits} ${edits === 1 ? "change" : "changes"} saved` : "No changes yet"}
        </p>
        {error && (
          <p role="alert" className="w-full text-[0.8125rem] leading-[1.5] text-fg-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );

  const reduce = usePrefersReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
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
              {course.topic}
            </h1>
            <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
              {course.goal}
            </p>
            {draftedIn && (
              <p className="tnum mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
                Drafted in {draftedIn}
              </p>
            )}

            <div className="mt-8">
              {numbered.map((m, mi) => (
                <section key={m.id} className="mb-6 last:mb-0">
                  <div className="group/mod flex items-center justify-between gap-3 border-b border-hair pb-2">
                    {editing === m.id ? (
                      <RenameInput
                        initial={m.title}
                        label="Module title"
                        className={`${renameField} label min-w-0 flex-1 px-1.5 py-0`}
                        onCommit={(value) => commitRename(m.id, value)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <Hint label="Rename this Module">
                        <Button
                          variant="bare"
                          onClick={() => setEditing(m.id)}
                          className="label block truncate text-fg-3"
                        >
                          {m.numeral}. {m.title}
                        </Button>
                      </Hint>
                    )}

                    <span className="flex shrink-0 items-center gap-x-3">
                      <span className="tnum text-[0.75rem] leading-[1.5] text-fg-dim">
                        {m.lessons.length} {m.lessons.length === 1 ? "Lesson" : "Lessons"}
                      </span>
                      <span className="hidden items-center sm:flex sm:opacity-0 sm:group-hover/mod:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100!">
                        <RowAction
                          label={`Move ${m.title} up`}
                          title="Move this Module up"
                          onClick={() =>
                            run({ kind: "moveModule", moduleId: m.id, toIndex: mi - 1 })
                          }
                          disabled={mi === 0 || pending}
                          className="p-1 disabled:opacity-20"
                        >
                          <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </RowAction>
                        <RowAction
                          label={`Move ${m.title} down`}
                          title="Move this Module down"
                          onClick={() =>
                            run({ kind: "moveModule", moduleId: m.id, toIndex: mi + 1 })
                          }
                          disabled={mi === numbered.length - 1 || pending}
                          className="p-1 disabled:opacity-20"
                        >
                          <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </RowAction>
                        <RowAction
                          label={`Remove ${m.title}`}
                          title="Remove this Module and its Lessons"
                          onClick={() => run({ kind: "removeModule", moduleId: m.id })}
                          disabled={pending}
                          className="p-1"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </RowAction>
                      </span>
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
                            onSelect: () =>
                              run({ kind: "moveModule", moduleId: m.id, toIndex: mi - 1 }),
                            disabled: mi === 0 || pending,
                          },
                          {
                            key: "down",
                            label: "Move down",
                            icon: <ArrowDown strokeWidth={1.75} />,
                            onSelect: () =>
                              run({ kind: "moveModule", moduleId: m.id, toIndex: mi + 1 }),
                            disabled: mi === numbered.length - 1 || pending,
                          },
                          {
                            key: "remove",
                            label: "Remove Module",
                            icon: <X strokeWidth={1.75} />,
                            onSelect: () => run({ kind: "removeModule", moduleId: m.id }),
                            disabled: pending,
                          },
                        ]}
                      />
                    </span>
                  </div>

                  <Reorder.Group
                    as="ul"
                    axis="y"
                    values={m.lessons}
                    onReorder={(next) =>
                      trackReorder(
                        m.id,
                        next.map((l) => l.id),
                      )
                    }
                  >
                    {m.lessons.map((l, li) => (
                      <DragRow
                        key={l.id}
                        value={l}
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
                              <Hint label="Drag to reorder">
                                <Button
                                  variant="icon-raised"
                                  aria-label={`Reorder ${l.title}`}
                                  className="cursor-grab touch-none p-0.5 text-fg-dim active:cursor-grabbing"
                                  onPointerDown={(event) => {
                                    if (pending) return;
                                    controls.start(event);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "ArrowUp" && li > 0) {
                                      event.preventDefault();
                                      moveLesson(m.id, l.id, li - 1);
                                    }
                                    if (event.key === "ArrowDown" && li < m.lessons.length - 1) {
                                      event.preventDefault();
                                      moveLesson(m.id, l.id, li + 1);
                                    }
                                  }}
                                >
                                  <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
                                </Button>
                              </Hint>
                            </span>

                            <span className="tnum text-[0.75rem] leading-5 text-fg-dim">{l.n}</span>

                            <span className="min-w-0 lg:flex lg:items-baseline lg:gap-x-3">
                              {editing === l.id ? (
                                <RenameInput
                                  initial={l.title}
                                  label="Lesson title"
                                  className={`${renameField} w-full px-1.5 py-0 text-[0.8125rem] leading-5 lg:w-[18rem] lg:shrink-0`}
                                  onCommit={(value) => commitRename(l.id, value)}
                                  onCancel={() => setEditing(null)}
                                />
                              ) : (
                                <Hint label="Rename this Lesson">
                                  <Button
                                    variant="bare"
                                    onClick={() => setEditing(l.id)}
                                    className="block max-w-full truncate text-left text-[0.8125rem] leading-5 font-medium text-fg lg:w-[18rem] lg:shrink-0"
                                  >
                                    {l.title}
                                  </Button>
                                </Hint>
                              )}
                              <span className="mt-0.5 block truncate text-[0.8125rem] leading-[1.5] text-fg-3 lg:mt-0 lg:min-w-0 lg:flex-1">
                                {l.summary}
                              </span>
                            </span>

                            <span className="hidden items-center justify-end sm:flex sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100!">
                              <RowAction
                                label={`Move ${l.title} up`}
                                title="Move this Lesson up"
                                onClick={() => moveLesson(m.id, l.id, li - 1)}
                                disabled={li === 0 || pending}
                                className="p-1 disabled:opacity-20"
                              >
                                <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </RowAction>
                              <RowAction
                                label={`Move ${l.title} down`}
                                title="Move this Lesson down"
                                onClick={() => moveLesson(m.id, l.id, li + 1)}
                                disabled={li === m.lessons.length - 1 || pending}
                                className="p-1 disabled:opacity-20"
                              >
                                <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </RowAction>
                              <RowAction
                                label={`Split ${l.title}`}
                                title="Split this Lesson in two"
                                onClick={() => setSplitting(l)}
                                disabled={pending}
                                className="p-1"
                              >
                                <Scissors className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </RowAction>
                              <RowAction
                                label={`Remove ${l.title}`}
                                title="Remove this Lesson"
                                onClick={() => run({ kind: "removeLesson", lessonId: l.id })}
                                disabled={pending}
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
                                  onSelect: () => moveLesson(m.id, l.id, li - 1),
                                  disabled: li === 0 || pending,
                                },
                                {
                                  key: "down",
                                  label: "Move down",
                                  icon: <ArrowDown strokeWidth={1.75} />,
                                  onSelect: () => moveLesson(m.id, l.id, li + 1),
                                  disabled: li === m.lessons.length - 1 || pending,
                                },
                                {
                                  key: "split",
                                  label: "Split in two",
                                  icon: <Scissors strokeWidth={1.75} />,
                                  onSelect: () => setSplitting(l),
                                  disabled: pending,
                                },
                                {
                                  key: "remove",
                                  label: "Remove Lesson",
                                  icon: <X strokeWidth={1.75} />,
                                  onSelect: () => run({ kind: "removeLesson", lessonId: l.id }),
                                  disabled: pending,
                                },
                              ]}
                            />
                          </>
                        )}
                      </DragRow>
                    ))}
                  </Reorder.Group>

                  <Button
                    variant="quiet"
                    onClick={() =>
                      run({
                        kind: "addLesson",
                        moduleId: m.id,
                        title: "Untitled Lesson",
                        summary: "Say what this one is for.",
                      })
                    }
                    disabled={pending}
                    className="mt-2.5 ml-2"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Add a Lesson
                  </Button>
                </section>
              ))}

              <Button
                variant="quiet"
                onClick={() => run({ kind: "addModule", title: "Untitled Module" })}
                disabled={pending}
                className="mt-2"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add a Module
              </Button>
            </div>

            {sources && sources.length > 0 && (
              <section className="mt-14 border-t border-hair pt-6">
                <h2 className="label text-fg-3">Sources</h2>
                <ul className="mt-3 grid gap-x-10 sm:grid-cols-2 2xl:grid-cols-4">
                  {sources.map((source) => (
                    <li key={source.ref} className="border-b border-hair py-2.5">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-[0.8125rem] leading-5 text-fg-2 hover:text-fg"
                      >
                        {source.title}
                      </a>
                      <span className="tnum mt-0.5 block truncate text-[0.75rem] leading-[1.5] text-fg-dim">
                        {domainOf(source.url)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {whyThisShape && (
              <section className="mt-14 border-t border-hair pt-6">
                <h2 className="label text-fg-3">Why this shape</h2>
                <div className="mt-4 grid gap-x-10 gap-y-6 lg:grid-cols-2">
                  {whyThisShape.terminalPerformances.length > 0 && (
                    <div className="max-w-(--measure)">
                      <p className="label text-fg-dim">You&apos;ll be able to</p>
                      <ul>
                        {whyThisShape.terminalPerformances.map((performance) => (
                          <li
                            key={performance}
                            className="border-b border-hair py-3 text-[0.8125rem] leading-5 text-fg-2"
                          >
                            {performance}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(whyThisShape.premise || whyThisShape.runningExample) && (
                    <div className="max-w-(--measure) space-y-6">
                      {whyThisShape.premise && (
                        <div>
                          <p className="label text-fg-dim">The premise</p>
                          <p className="mt-3 text-[0.8125rem] leading-[1.6] text-fg-3">
                            {whyThisShape.premise}
                          </p>
                        </div>
                      )}
                      {whyThisShape.runningExample && (
                        <div>
                          <p className="label text-fg-dim">Running example</p>
                          <p className="mt-3 text-[0.8125rem] leading-[1.6] text-fg-3">
                            {whyThisShape.runningExample}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {footbar("hidden lg:block")}
          </div>

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
                chatId={`outline-${course.id}`}
                endpoint={`/api/courses/${course.id}/tailor`}
                turns={tailorTurns ?? []}
                onFinish={tailorFinished}
                plan={plan ?? undefined}
                onApply={applyPlan}
                applying={pending}
                onDiscard={(id) => reviewOperation(id, "discarded")}
                onRestore={(id) => reviewOperation(id, "proposed")}
                scrollport={false}
              />
            </div>
          </aside>

          {footbar("lg:hidden")}
        </motion.div>

        {splitting && (
          <SplitDialog
            key={splitting.id}
            onClose={() => setSplitting(null)}
            onSplit={(secondTitle, secondSummary) => {
              run({
                kind: "splitLesson",
                lessonId: splitting.id,
                secondTitle,
                secondSummary,
              });
              setSplitting(null);
            }}
          />
        )}
      </div>
    </MotionConfig>
  );
}

/* Reorder drag controls come from a hook, one per row; this wrapper owns the
   hook and hands the controls to the grip in the row's left gutter. */
function DragRow({
  value,
  onDragStart,
  onDragEnd,
  className,
  children,
}: {
  value: Lesson;
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
