"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, Plus } from "lucide-react";

import { CourseRowMenu } from "@/components/course-row-menu";
import { Button } from "@/components/ui/button";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import {
  GROUP_LABELS,
  type CourseLibraryGroup,
  type CourseLibraryItem,
} from "@/lib/course/library";
import { cn } from "@/lib/utils";

/* How long the pointer rests on a row before the pane turns to it. Long
   enough that crossing the list to reach the pane never swaps its subject,
   short enough to read as intent. */
const REST_DELAY = 220;

const GROUP_ORDER: CourseLibraryGroup[] = ["needs", "in-progress", "done"];

/* A Course that has not been written yet carries the dashed rule in the
   mark column; a written one carries nothing unless it is live or done. */
const UNWRITTEN = new Set(["designing", "writing", "reviewing", "outline-ready", "retry"]);

function RowMark({ item }: { item: CourseLibraryItem }) {
  if (item.isLive) return <LiveMark />;
  if (item.state === "complete") {
    return (
      <span className="text-fg-3">
        <DoneCheck />
      </span>
    );
  }
  if (UNWRITTEN.has(item.state)) return <UnsetMark />;
  return null;
}

function CoursePane({ item }: { item: CourseLibraryItem }) {
  const reading =
    (item.state === "resume" || item.state === "revising") && item.position && item.nextLessonTitle;

  return (
    <section aria-labelledby="course-pane-topic" className="min-h-0 flex-1 lg:overflow-y-auto">
      {/* The reading column's own geometry, so the pane previews the page it
          opens. Keyed on the Course so a turn of the pane reads as a turn: the
          content comes back over --dur instead of being repainted. */}
      <div
        key={item.id}
        className="mk-turn mx-auto w-full max-w-[41rem] px-5 pt-6 pb-20 sm:px-8 sm:pt-9 lg:px-10"
      >
        <h2
          id="course-pane-topic"
          className="max-w-[34rem] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance text-fg"
        >
          {item.topic}
        </h2>
        <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
          {item.goal}
        </p>

        {reading ? (
          <div className="mt-10">
            <p className="text-[0.6875rem] leading-none font-semibold tracking-[0.06em] text-fg-dim uppercase">
              {item.position?.moduleNumeral}. {item.position?.moduleTitle}
            </p>
            <p className="tnum mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
              Lesson {item.position?.lesson} of {item.position?.total}
            </p>
            <p className="mt-3 max-w-[30rem] text-[1rem] leading-[1.5] font-semibold tracking-[-0.011em] text-fg">
              {item.nextLessonTitle}
            </p>
            {item.nextLessonMinutes ? (
              <p className="tnum mt-1 text-[0.75rem] leading-[1.5] text-fg-dim">
                {item.nextLessonMinutes} min
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-10 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
            {item.detail}
          </p>
        )}

        <div className="mt-8">
          <Button variant="primary" render={<Link href={item.href} />}>
            {item.actionLabel}
          </Button>
        </div>

        <p className="tnum mt-10 text-[0.75rem] leading-[1.5] text-fg-dim">{item.note}</p>
      </div>
    </section>
  );
}

/**
 * The Courses page: the library's index on the left, the open Course on the
 * right. Rows open their Course on one click; resting on a row, or tabbing
 * to it, turns the pane to that Course first.
 */
export function CourseLibrary({ items }: { items: CourseLibraryItem[] }) {
  const [query, setQuery] = useState("");
  const [peeked, setPeeked] = useState<string | null>(null);
  const restTimer = useRef<number | null>(null);
  const searchField = useRef<HTMLInputElement | null>(null);

  const cancelRest = () => {
    if (restTimer.current !== null) {
      window.clearTimeout(restTimer.current);
      restTimer.current = null;
    }
  };

  const peekSoon = (id: string) => {
    cancelRest();
    restTimer.current = window.setTimeout(() => setPeeked(id), REST_DELAY);
  };

  const peekNow = (id: string) => {
    cancelRest();
    setPeeked(id);
  };

  useEffect(() => cancelRest, []);

  /* `/` puts the cursor in the index from anywhere on the page. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchField.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.topic} ${item.goal}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        label: GROUP_LABELS[group],
        items: visible.filter((item) => item.group === group),
      })).filter((group) => group.items.length > 0),
    [visible],
  );

  const live = items.find((item) => item.isLive) ?? items[0];
  /* The pane's subject is the learner's, not the filter's: hovering, tabbing
     to or clicking a row turns the pane, and a search never turns it back. */
  const shown = items.find((item) => item.id === peeked) ?? live;

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0 lg:flex-row lg:overflow-hidden">
      <section
        aria-label="Courses"
        className="flex flex-col bg-panel max-lg:border-t max-lg:border-hair lg:h-full lg:w-[22rem] lg:shrink-0 lg:border-r lg:border-hair"
      >
        <div className="shrink-0 px-4 pt-6 pb-3 lg:pt-8">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
              Courses
            </h1>
            {/* The index carries New Course from lg up; below that the floating
                button does, where a thumb can reach it. */}
            <Button
              variant="compact"
              render={<Link href="/courses/new" />}
              className="max-lg:hidden"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              New Course
            </Button>
          </div>
          <div role="search" className="relative mt-4">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-3"
              strokeWidth={1.75}
            />
            <input
              ref={searchField}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Search Courses"
              aria-label="Search Courses"
              className="w-full bg-canvas py-2 pr-8 pl-8 text-[0.8125rem] leading-[1.55] text-fg transition-colors outline-none placeholder:text-fg-3 focus:bg-raised [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear the search"
                onClick={() => {
                  setQuery("");
                  searchField.current?.focus();
                }}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 p-1 text-fg-3 transition-colors hover:text-fg"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="scroll-thin min-h-0 flex-1 pb-20 lg:overflow-y-auto lg:pb-8">
          {groups.length === 0 ? (
            <div className="px-4 py-6">
              <p className="text-[0.8125rem] leading-[1.55] text-fg-3">
                No Courses match &ldquo;{query.trim()}&rdquo;.
              </p>
              <Button
                variant="quiet"
                className="mt-1 px-0 underline decoration-hair underline-offset-2"
                onClick={() => setQuery("")}
              >
                Clear the search
              </Button>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.group}>
                <h2 className="sticky top-0 z-10 bg-panel px-4 pt-4 pb-2 text-[0.6875rem] leading-none font-semibold tracking-[0.06em] text-fg-dim uppercase">
                  {group.label}
                </h2>
                <ul>
                  {group.items.map((item) => {
                    const needs = item.group === "needs";
                    const shownHere = item.id === shown.id;
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "group relative border-b border-hair transition-colors duration-[120ms] ease-expo focus-within:bg-raised",
                          /* The row the pane is showing sits one step off the
                             panel, the way the open Lesson does in the rail;
                             a row merely under the pointer is half that step,
                             so the two never read as the same signal. */
                          shownHere ? "bg-raised" : "hover:bg-raised/60",
                        )}
                      >
                        <Link
                          href={item.href}
                          aria-current={shownHere ? "true" : undefined}
                          onMouseEnter={() => peekSoon(item.id)}
                          onMouseLeave={cancelRest}
                          onFocus={() => peekNow(item.id)}
                          /* Rows run edge to edge inside the index's own
                             scrollport, so a ring at offset would lose its
                             left and right sides to the clip. Inset the way
                             the workspace header's field and the Outline's
                             Courses link already are. */
                          className="grid grid-cols-[0.75rem_1fr_auto] items-center gap-x-3 py-3 pr-9 pl-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live"
                        >
                          <span className="flex h-5 w-3 items-center justify-center">
                            <RowMark item={item} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
                              {item.topic}
                            </span>
                            <span className="tnum mt-1 block truncate text-[0.75rem] leading-[1.5] text-fg-dim">
                              {item.lastTouched}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "tnum shrink-0 text-[0.75rem] leading-[1.5]",
                              needs ? "font-medium text-fg" : "text-fg-3",
                            )}
                          >
                            {item.fact}
                          </span>
                        </Link>

                        <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity duration-[120ms] ease-expo group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                          <CourseRowMenu courseId={item.id} topic={item.topic} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="max-lg:order-first max-lg:bg-canvas lg:flex lg:min-h-0 lg:flex-1">
        <CoursePane item={shown} />
      </div>
    </div>
  );
}
