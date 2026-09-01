"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStickyFollow } from "@/hooks/use-sticky-follow";
import { ArrowUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/lib/demo-course";
import { applyPlan, type LibraryCourse } from "@/lib/demo-library";
import { Button } from "./ui/button";
import { field } from "@/lib/ui";
import { Skeleton } from "./ui/skeleton";
import { Textarea } from "./ui/textarea";
import { DoneCheck, LiveMark } from "./workspace/marks";

/**
 * The checkpoint the product is built around: the Outline exists, no Lesson
 * content does, and the learner shapes it before any is generated.
 *
 * The same grammar as the rail — mark, number, title, hairline-divided rows,
 * one accent — with the summaries the rail deliberately leaves out, because
 * this is the surface where you decide what a Lesson is for.
 */
export function OutlineEditor({ course }: { course: LibraryCourse }) {
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());
  const [discarded, setDiscarded] = useState<ReadonlySet<string>>(new Set());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [extra, setExtra] = useState<Record<string, Lesson[]>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  /* The Tailor column is taller than the viewport once a plan has a few
     changes in it, so it rides the scroll rather than pinning half of
     itself out of reach. */
  const tailor = useRef<HTMLElement>(null);
  /* Ids for Lessons the learner adds. A counter, not a clock: two adds in
     the same millisecond would otherwise collide on a key. */
  const added = useRef(0);

  useStickyFollow(tailor);

  /* Derived, never mutated: base Modules, plus the approved Tailor changes,
     plus this session's manual edits. Undo is dropping one of the three. */
  const modules = useMemo(() => {
    let n = 0;
    return applyPlan(course.modules, applied, course.plan).map((m) => ({
      ...m,
      lessons: [...m.lessons, ...(extra[m.numeral] ?? [])]
        .filter((l) => !removed.has(l.id))
        .map((l) => ({
          ...l,
          title: titles[l.id] ?? l.title,
          n: ++n,
        })),
    }));
  }, [course, applied, removed, titles, extra]);

  const lessons = modules.flatMap((m) => m.lessons);
  const generated = course.phase === "reading";
  const live = lessons.find((l) => l.status !== "unset" && !l.stampedOn) ?? null;
  const edits =
    Object.keys(titles).length +
    removed.size +
    Object.values(extra).reduce((sum, l) => sum + l.length, 0);

  const open = course.plan.filter((c) => !discarded.has(c.id));

  function rename(id: string, value: string) {
    const next = value.trim();
    setEditing(null);
    if (next) setTitles((t) => ({ ...t, [id]: next }));
  }

  function addLesson(numeral: string) {
    const id = `new-${numeral}-${(added.current += 1)}`;
    setExtra((e) => ({
      ...e,
      [numeral]: [
        ...(e[numeral] ?? []),
        { id, title: "Untitled Lesson", summary: "Say what this one is for.", minutes: 10, status: "unset" },
      ],
    }));
    setEditing(id);
  }

  function resetEdits() {
    setTitles({});
    setRemoved(new Set());
    setExtra({});
  }

  /* Approving the shape is where generation starts. The Outline is saved;
     Lesson generation takes over from here in the product's next step, so
     this stays on the checkpoint rather than handing over anywhere else. */
  function generate() {
    setGenerating(true);
  }

  if (generating) {
    return (
      <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8" aria-live="polite">
        <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
          {course.topic}
        </h1>
        <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
          Generating all {lessons.length} Lessons in one pass, against the shape
          you just approved.
        </p>
        <div className="mt-9 space-y-2.5">
          {[10, 6, 8, 5, 9].map((w, i) => (
            <Skeleton key={i} className="h-4 rounded-sm bg-panel" style={{ width: `${w * 8 + 12}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[68rem] px-5 sm:px-8">
      <div className="flex flex-col lg:flex-row lg:gap-10">
        {/* The Outline itself */}
        <div className="min-w-0 flex-1 pt-10">
          <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
            {course.topic}
          </h1>
          <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.6] text-fg-2">
            {course.goal}
          </p>

          <div className="mt-10">
            {modules.map((m) => (
              <section key={m.numeral} className="mb-7 last:mb-0">
                <h2 className="label border-b border-hair pb-2 text-fg-3">
                  {m.numeral}. {m.title}
                </h2>

                <ul>
                  {m.lessons.map((l) => {
                    const isLive = live?.id === l.id;
                    return (
                      <li
                        key={l.id}
                        className={cn(
                          "group row grid items-start gap-x-2.5 border-b border-hair px-2 py-3 hover:bg-panel",
                          generated
                            ? "grid-cols-[0.75rem_1.5rem_1fr_auto]"
                            : "grid-cols-[1.5rem_1fr_auto]",
                        )}
                      >
                        {/* Before approval every row would carry the same
                            dash, which says nothing the head has not. Once
                            generated, the mark is where you are up to. */}
                        {generated ? (
                          <span className="flex h-5 w-3 items-center justify-center">
                            {isLive ? (
                              <LiveMark />
                            ) : l.stampedOn ? (
                              <span className="text-fg-3">
                                <DoneCheck />
                              </span>
                            ) : null}
                          </span>
                        ) : null}

                        <span className="tnum pt-px text-[0.75rem] leading-5 text-fg-3">{l.n}</span>

                        <span className="min-w-0">
                          {editing === l.id ? (
                            <input
                              autoFocus
                              defaultValue={l.title}
                              aria-label="Lesson title"
                              onBlur={(e) => rename(l.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") rename(l.id, e.currentTarget.value);
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className={`${field} py-1`}
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
                          <Button
                            variant="icon-raised"
                            onClick={() => setRemoved((r) => new Set(r).add(l.id))}
                            aria-label={`Remove ${l.title}`}
                            title="Remove this Lesson"
                            className="p-1 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <Button
                  variant="quiet"
                  onClick={() => addLesson(m.numeral)}
                  className="mt-2.5 ml-2"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Add a Lesson
                </Button>
              </section>
            ))}
          </div>

          {/* The decision bar. It stays with you down a twenty-Lesson Outline. */}
          <div className="sticky bottom-0 mt-10 border-t border-hair bg-canvas py-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {course.phase === "outline" ? (
                <Button onClick={generate}>Generate the Lessons</Button>
              ) : (
                <Button render={<Link href={`/courses/${course.id}`} />}>
                  Open the Course
                </Button>
              )}

              <p className="tnum text-[0.75rem] text-fg-3">
                {edits > 0 ? (
                  <>
                    {edits} manual {edits === 1 ? "edit" : "edits"}
                    {applied.size > 0
                      ? `, ${applied.size} Tailor ${applied.size === 1 ? "change" : "changes"}`
                      : ""}
                  </>
                ) : applied.size > 0 ? (
                  <>
                    {applied.size} Tailor {applied.size === 1 ? "change" : "changes"} applied
                  </>
                ) : (
                  <>No changes yet</>
                )}
              </p>

              {edits > 0 ? (
                <Button variant="quiet" onClick={resetEdits} className="ml-auto">
                  Revert my edits
                </Button>
              ) : (
                <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
                  Back to Courses
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* The Tailor. The Tutor is not here: there is no Lesson content for
            it to be grounded in until the Outline is approved. */}
        <aside
          ref={tailor}
          className="w-full shrink-0 border-t border-hair pt-8 pb-20 lg:sticky lg:top-0 lg:w-[20rem] lg:self-start lg:border-t-0 lg:border-l lg:pt-10 lg:pb-10 lg:pl-8"
        >
          <h2 className="label text-fg-3">Tailor</h2>
          <p className="mt-2 text-[0.8125rem] leading-[1.6] text-fg-3">
            Nothing is written until you approve it.
          </p>

          <TailorComposer />

          <ul className="mt-6 border-t border-hair">
            {open.length === 0 ? (
              <li className="py-4 text-[0.8125rem] leading-[1.6] text-fg-3">
                Nothing pending. Ask for a change and it will be drafted here.
              </li>
            ) : null}
            {open.map((change) => {
              const bound = applied.has(change.id);
              return (
                <li key={change.id} className="border-b border-hair py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="label text-fg-3">{change.verb}</span>
                    <span className="tnum text-[0.6875rem] text-fg-dim">{change.entry}</span>
                  </div>
                  <p className="mt-2 text-[0.875rem] leading-[1.45] font-medium text-fg">
                    {change.detail}
                  </p>
                  <p className="mt-1.5 text-[0.8125rem] leading-[1.5] text-fg-3">{change.reason}</p>

                  <div className="mt-3 flex items-center gap-3">
                    {bound ? (
                      <>
                        <span className="text-[0.75rem] text-fg-3">Applied</span>
                        <Button
                          variant="quiet"
                          onClick={() =>
                            setApplied((a) => {
                              const copy = new Set(a);
                              copy.delete(change.id);
                              return copy;
                            })
                          }
                          className="ml-auto"
                        >
                          Undo
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="compact"
                          onClick={() => setApplied((a) => new Set(a).add(change.id))}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="discard"
                          onClick={() => setDiscarded((d) => new Set(d).add(change.id))}
                          className="ml-auto"
                        >
                          Discard
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}

/** Same contract as the workspace composer: it accepts, it does not pretend. */
function TailorComposer() {
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "answered">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || state === "pending") return;
          setDraft("");
          setState("pending");
          timer.current = setTimeout(() => setState("answered"), 900);
        }}
      >
        <div className="flex items-end gap-2 rounded-md bg-panel px-2.5 py-2 transition-colors focus-within:bg-raised">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Drop the theory, keep the worked examples"
            aria-label="Tell the Tailor what to change"
            className="min-h-[2.5rem] flex-1 bg-transparent px-0 py-0 focus:bg-transparent"
          />
          <Button
            type="submit"
            variant="icon-raised"
            disabled={!draft.trim() || state === "pending"}
            aria-label="Send to the Tailor"
            className="mb-0.5 disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2} />
          </Button>
        </div>
      </form>

      {state !== "idle" ? (
        <p className={cn("mt-3 text-[0.8125rem] leading-[1.6]", state === "pending" ? "text-fg-3" : "text-fg-2")} aria-live="polite">
          {state === "pending"
            ? "Drafting a change plan…"
            : "The Tailor is not connected in this build. Your change plan would appear below, one row per change, and nothing would be written until you approved it."}
        </p>
      ) : null}
    </>
  );
}
