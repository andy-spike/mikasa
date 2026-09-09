"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Combine, Plus, Scissors, X } from "lucide-react";
import { applyOutlineOpAction, approveOutlineAction } from "@/lib/actions/outline";
import { cancelGenerationAction } from "@/lib/actions/courses";
import { applyPlanToOutlineAction, reviewTailorOperationAction } from "@/lib/actions/tailor";
import type { OutlineEditorCourse } from "@/lib/course/view";
import type { OutlineOp } from "@/lib/course/structure";
import { TailorConversation, type PlanView, type Turn } from "./tailor-conversation";
import { Button } from "./ui/button";
import { CancelRunButton } from "./cancel-run-button";
import { DoneCheck, UnsetMark } from "./workspace/marks";
import { field } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Textarea } from "./ui/textarea";
import { useStickyFollow } from "@/hooks/use-sticky-follow";
import { useSyncedState } from "@/hooks/use-synced-state";
import { postStream } from "@/lib/api/post";
import type { ReasoningEffort } from "@/lib/model";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type Module = OutlineEditorCourse["modules"][number];

function reviewStatusText(runStep: string | null | undefined): string {
  if (runStep?.startsWith("corrections:")) {
    return `Correction round ${runStep.slice("corrections:".length)}: fixing what the review found.`;
  }
  if (runStep === "publish") return "The review passed. Publishing the Course.";
  if (runStep?.startsWith("lesson:")) return "Correcting what the review found.";
  return "The review pass is running: structure, accuracy, learning design.";
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
    <Button
      variant="icon-raised"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={className}
    >
      {children}
    </Button>
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

type Props = {
  course: OutlineEditorCourse;
  runStep?: string | null;
  tailorTurns?: Turn[];
  tailorPlan?: PlanView | null;
  onRefreshPlan?: () => Promise<PlanView | null>;
};

export function OutlineEditor({ course, runStep, tailorTurns, tailorPlan, onRefreshPlan }: Props) {
  const router = useRouter();
  const tailorRef = useRef<HTMLElement | null>(null);
  useStickyFollow(tailorRef);
  const [modules, setModules] = useState<Module[]>(course.modules);
  const [version, setVersion] = useState(course.version);
  const [edits, setEdits] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<Module["lessons"][number] | null>(null);
  const [generating, setGenerating] = useState(
    course.phase === "generating" || course.phase === "reviewing",
  );
  const [pending, startTransition] = useTransition();

  const [plan, setPlan] = useSyncedState(tailorPlan);

  const [adopted, setAdopted] = useState(course.version);
  if (course.version !== adopted) {
    setAdopted(course.version);
    setModules(course.modules);
    setVersion(course.version);
    setError(null);
  }

  const [adoptedPhase, setAdoptedPhase] = useState(course.phase);
  if (course.phase !== adoptedPhase) {
    setAdoptedPhase(course.phase);
    setGenerating(course.phase === "generating" || course.phase === "reviewing");
  }

  const lessons = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const numbered = useMemo(() => {
    let n = 0;
    return modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, n: ++n })) }));
  }, [modules]);

  const polling = generating || course.phase !== "editing";
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [polling, router]);

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
      if (result.ok) {
        setGenerating(true);
        router.refresh();
      } else {
        failWith(result.message, result.reason);
      }
    });
  }

  async function askTailor(
    text: string,
    effort: ReasoningEffort,
    onDelta: (chunk: string) => void,
  ): Promise<boolean> {
    const done = await postStream(
      `/api/courses/${course.id}/tailor`,
      { message: text, effort },
      onDelta,
    );
    if (!done) return false;
    if (onRefreshPlan) setPlan(await onRefreshPlan());
    return true;
  }

  async function reviewOperation(
    operationId: string,
    status: "accepted" | "discarded" | "proposed",
  ) {
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
    submit(async () => {
      const result = await applyPlanToOutlineAction(course.id, plan.id);
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

  if (generating) {
    const reviewing = course.phase === "reviewing";
    const savedIndex =
      runStep && runStep.startsWith("lesson:")
        ? lessons.findIndex((l) => runStep.slice(7) === l.id)
        : -1;
    // currentStep points at the last saved Lesson, so the next one is doing.
    const doingIndex = reviewing || runStep === "complete" ? -1 : savedIndex + 1;
    const allDone = doingIndex < 0 || doingIndex >= lessons.length;
    const writingNumber = allDone ? lessons.length : doingIndex + 1;
    const reviewStatus = reviewing ? reviewStatusText(runStep) : null;
    return (
      <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8" aria-live="polite">
        <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
          {course.topic}
        </h1>
        <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
          {reviewing
            ? `All ${lessons.length} Lessons are written. ${reviewStatus ?? ""}`
            : `Generating all ${lessons.length} Lessons in one pass, against the shape you just approved.`}
        </p>
        {!reviewing && (
          <p className="tnum mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
            {runStep && !runStep.startsWith("lesson:") && runStep !== "complete"
              ? "Starting."
              : `Lesson ${Math.min(writingNumber, lessons.length)} of ${lessons.length}.`}
          </p>
        )}
        <p className="mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
          You can leave this page. The Course will be here when you come back.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <CancelRunButton
            idleLabel="Cancel generation"
            confirmLabel="Discard the partial Course?"
            pendingLabel="Discarding…"
            onConfirm={() => cancelGenerationAction(course.id)}
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
          <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
            Back to Courses
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[0.8125rem] leading-[1.5] text-fg-2">
            {error}
          </p>
        )}
        <ol className="mt-6 border-t border-hair">
          {lessons.map((lesson, i) => {
            const done = allDone || i < doingIndex;
            const doing = !allDone && i === doingIndex;
            return (
              <li
                key={lesson.id}
                className="grid grid-cols-[0.75rem_1fr_auto] items-center gap-x-2 border-b border-hair px-2 py-1.5"
                aria-current={doing ? "true" : undefined}
              >
                <span className="flex h-4 w-3 items-center justify-center text-fg-3">
                  {done ? <DoneCheck /> : <UnsetMark />}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-[0.8125rem] leading-5 text-fg-2",
                      doing && "font-medium text-fg",
                    )}
                  >
                    <span className="tnum mr-2 text-fg-3">{i + 1}</span>
                    {lesson.title}
                  </span>
                </span>
                <span className="text-[0.75rem] leading-[1.5] text-fg-3">
                  {done ? "Done" : doing ? "Doing" : "Queued"}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[68rem] px-5 sm:px-8">
      <div className="flex flex-col lg:flex-row lg:gap-10">
        <div className="min-w-0 flex-1 pt-10">
          <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
            {course.topic}
          </h1>
          <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.6] text-fg-2">
            {course.goal}
          </p>

          <div className="mt-10">
            {numbered.map((m, mi) => (
              <section key={m.id} className="mb-7 last:mb-0">
                <div className="group/mod flex items-center justify-between gap-3 border-b border-hair pb-2">
                  {editing === m.id ? (
                    <RenameInput
                      initial={m.title}
                      label="Module title"
                      className={`${field} flex-1 py-1`}
                      onCommit={(value) => commitRename(m.id, value)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <Button
                      variant="bare"
                      onClick={() => setEditing(m.id)}
                      title="Rename this Module"
                      className="label block truncate text-fg-3"
                    >
                      {m.numeral}. {m.title}
                    </Button>
                  )}

                  <span className="flex shrink-0 items-center">
                    <RowAction
                      label={`Move ${m.title} up`}
                      title="Move this Module up"
                      onClick={() => run({ kind: "moveModule", moduleId: m.id, toIndex: mi - 1 })}
                      disabled={mi === 0 || pending}
                      className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/mod:opacity-100 disabled:opacity-20"
                    >
                      <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </RowAction>
                    <RowAction
                      label={`Move ${m.title} down`}
                      title="Move this Module down"
                      onClick={() => run({ kind: "moveModule", moduleId: m.id, toIndex: mi + 1 })}
                      disabled={mi === numbered.length - 1 || pending}
                      className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/mod:opacity-100 disabled:opacity-20"
                    >
                      <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </RowAction>
                    <RowAction
                      label={`Remove ${m.title}`}
                      title="Remove this Module and its Lessons"
                      onClick={() => run({ kind: "removeModule", moduleId: m.id })}
                      disabled={pending}
                      className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/mod:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </RowAction>
                  </span>
                </div>

                <ul>
                  {m.lessons.map((l, li) => (
                    <li
                      key={l.id}
                      className="group row grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-2.5 border-b border-hair px-2 py-3 hover:bg-panel"
                    >
                      <span className="tnum pt-px text-[0.75rem] leading-5 text-fg-3">{l.n}</span>

                      <span className="min-w-0">
                        {editing === l.id ? (
                          <RenameInput
                            initial={l.title}
                            label="Lesson title"
                            className={`${field} py-1`}
                            onCommit={(value) => commitRename(l.id, value)}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <Button
                            variant="bare"
                            onClick={() => setEditing(l.id)}
                            title="Rename this Lesson"
                            className="block w-full truncate text-left text-[0.8125rem] leading-5 font-medium text-fg"
                          >
                            {l.title}
                          </Button>
                        )}
                        <span className="mt-1 block text-[0.8125rem] leading-[1.5] text-fg-3">
                          {l.summary}
                        </span>
                      </span>

                      <span className="flex items-center pt-0.5">
                        <RowAction
                          label={`Move ${l.title} up`}
                          title="Move this Lesson up"
                          onClick={() =>
                            run({
                              kind: "moveLesson",
                              lessonId: l.id,
                              toModuleId: m.id,
                              toIndex: li - 1,
                            })
                          }
                          disabled={li === 0 || pending}
                          className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-20"
                        >
                          <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </RowAction>
                        <RowAction
                          label={`Move ${l.title} down`}
                          title="Move this Lesson down"
                          onClick={() =>
                            run({
                              kind: "moveLesson",
                              lessonId: l.id,
                              toModuleId: m.id,
                              toIndex: li + 1,
                            })
                          }
                          disabled={li === m.lessons.length - 1 || pending}
                          className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-20"
                        >
                          <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </RowAction>
                        <RowAction
                          label={`Split ${l.title}`}
                          title="Split this Lesson in two"
                          onClick={() => setSplitting(l)}
                          disabled={pending}
                          className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Scissors className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </RowAction>
                        <RowAction
                          label={`Merge ${l.title} with the next Lesson`}
                          title="Merge the next Lesson into this one"
                          onClick={() =>
                            run({ kind: "mergeLesson", lessonId: l.id, direction: "next" })
                          }
                          disabled={li === m.lessons.length - 1 || pending}
                          className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-20"
                        >
                          <Combine className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </RowAction>
                        <RowAction
                          label={`Remove ${l.title}`}
                          title="Remove this Lesson"
                          onClick={() => run({ kind: "removeLesson", lessonId: l.id })}
                          disabled={pending}
                          className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </RowAction>
                      </span>
                    </li>
                  ))}
                </ul>

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
              className="mt-2"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Add a Module
            </Button>
          </div>

          <div className="sticky bottom-0 mt-10 border-t border-hair bg-canvas py-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button onClick={approve} disabled={pending}>
                Generate the Lessons
              </Button>

              <p className="tnum text-[0.75rem] text-fg-3">
                {edits > 0
                  ? `${edits} ${edits === 1 ? "change" : "changes"} saved`
                  : "No changes yet"}
              </p>

              {error && (
                <p role="alert" className="w-full text-[0.8125rem] leading-[1.5] text-fg-2">
                  {error}
                </p>
              )}

              <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
                Back to Courses
              </Button>
            </div>
          </div>
        </div>

        <aside
          ref={tailorRef}
          className="w-full shrink-0 border-t border-hair pt-8 pb-20 lg:sticky lg:top-0 lg:w-[20rem] lg:self-start lg:border-t-0 lg:border-l lg:pt-10 lg:pb-10 lg:pl-8"
        >
          <h2 className="label text-fg-3">Tailor</h2>
          <p className="mt-2 text-[0.8125rem] leading-[1.6] text-fg-3">
            Nothing is written until you apply it.
          </p>
          <div className="mt-5">
            <TailorConversation
              turns={tailorTurns ?? []}
              onAsk={askTailor}
              plan={plan ?? undefined}
              onAccept={(id) => reviewOperation(id, "accepted")}
              onDiscard={(id) => reviewOperation(id, "discarded")}
              onRestore={(id) => reviewOperation(id, "proposed")}
              scrollport={false}
              applySlot={
                <Button onClick={applyPlan} disabled={pending} className="w-full">
                  Apply the accepted changes
                </Button>
              }
            />
          </div>
        </aside>
      </div>

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
