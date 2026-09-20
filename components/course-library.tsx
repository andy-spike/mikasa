"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";

import { CourseRowMenu } from "@/components/course-row-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@/components/workspace/hint";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import {
  GROUP_LABELS,
  type CourseLibraryGroup,
  type CourseLibraryItem,
} from "@/lib/course/library";
import { cn } from "@/lib/utils";

/* A Course that has not been written yet carries the dashed rule in the
   mark column; a written one carries nothing unless it is live or done. */
const UNWRITTEN = new Set(["designing", "writing", "reviewing", "outline-ready", "retry"]);

type StatusFilter = "all" | CourseLibraryGroup;
type SortKey = "recent" | "topic" | "progress";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently touched",
  topic: "Topic A–Z",
  progress: "Most complete",
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs", label: GROUP_LABELS.needs },
  { value: "in-progress", label: GROUP_LABELS["in-progress"] },
  { value: "done", label: GROUP_LABELS.done },
];

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

function progressRatio(item: CourseLibraryItem): number {
  if (item.totalCount <= 0) return 0;
  return item.doneCount / item.totalCount;
}

/**
 * The Courses page: a minimal centered list. One click on a row opens its
 * Course; the search field narrows by Topic or Goal, the filter buttons pick
 * a state, and the sort control orders the rows.
 */
export function CourseLibrary({ items }: { items: CourseLibraryItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const searchField = useRef<HTMLInputElement | null>(null);

  /* `/` puts the cursor in the search from anywhere on the page. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
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
    const matched = items.filter((item) => {
      if (filter !== "all" && item.group !== filter) return false;
      if (!needle) return true;
      return `${item.topic} ${item.goal}`.toLowerCase().includes(needle);
    });
    const ordered = [...matched];
    if (sort === "topic") {
      ordered.sort((a, b) => a.topic.localeCompare(b.topic));
    } else if (sort === "progress") {
      ordered.sort((a, b) => progressRatio(b) - progressRatio(a) || b.touchedAt - a.touchedAt);
    } else {
      ordered.sort((a, b) => b.touchedAt - a.touchedAt);
    }
    return ordered;
  }, [items, query, filter, sort]);

  const resetFilters = () => {
    setQuery("");
    setFilter("all");
    searchField.current?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-[40rem] px-5 pt-10 pb-24 sm:px-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
          Courses
        </h1>
        <Button variant="compact" render={<Link href="/courses/new" />}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          New Course
        </Button>
      </div>

      <div role="search" className="relative mt-6">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-fg-3"
          strokeWidth={1.75}
        />
        <Input
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
          className="pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => {
              setQuery("");
              searchField.current?.focus();
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-fg-3 transition-colors hover:text-fg"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter Courses by state"
          className="flex flex-wrap items-center gap-1"
        >
          {FILTERS.map((option) => (
            <Button
              key={option.value}
              variant={filter === option.value ? "compact" : "quiet"}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={filter === option.value ? undefined : "px-2.5 py-1.5"}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger aria-label="Sort Courses" className="w-fit min-w-36 py-2">
            <SelectValue>{(value) => SORT_LABELS[value as SortKey] ?? ""}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">{SORT_LABELS.recent}</SelectItem>
            <SelectItem value="topic">{SORT_LABELS.topic}</SelectItem>
            <SelectItem value="progress">{SORT_LABELS.progress}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p aria-live="polite" className="tnum mt-4 text-[0.75rem] leading-[1.5] text-fg-dim">
        {visible.length === items.length
          ? `${items.length} ${items.length === 1 ? "Course" : "Courses"}`
          : `${visible.length} of ${items.length} Courses`}
      </p>

      {visible.length === 0 ? (
        <div className="border-t border-hair pt-10">
          <p className="text-[0.9375rem] leading-[1.66] text-fg-2">
            {query.trim() || filter !== "all"
              ? `No Courses match${query.trim() ? ` “${query.trim()}”` : ""}.`
              : "No Courses yet."}
          </p>
          {query.trim() || filter !== "all" ? (
            <Button
              variant="quiet"
              className="mt-1 px-0 underline decoration-hair underline-offset-2"
              onClick={resetFilters}
            >
              Clear the search and filters
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-2 border-t border-hair">
          {visible.map((item) => {
            const needs = item.group === "needs";
            return (
              <li
                key={item.id}
                className="group relative border-b border-hair transition-colors duration-[120ms] ease-expo focus-within:bg-raised hover:bg-raised/60"
              >
                <Hint
                  label={
                    <span className="block">
                      <span className="block font-medium text-fg">{item.topic}</span>
                      <span className="mt-0.5 block">{item.goal}</span>
                    </span>
                  }
                >
                  <Link
                    href={item.href}
                    /* Rows run edge to edge in the list, so a ring at offset
                       would lose its sides to the clip. Inset the way the
                       workspace header's field already is. */
                    className="grid grid-cols-[0.75rem_1fr] items-start gap-x-3 py-3.5 pr-9 pl-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live"
                  >
                    <span className="flex h-5 w-3 items-center justify-center">
                      <RowMark item={item} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
                        {item.topic}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.8125rem] leading-[1.55] text-fg-3">
                        {item.goal}
                      </span>
                      <span className="tnum mt-1 block truncate text-[0.75rem] leading-[1.5] text-fg-dim">
                        <span className={cn(needs && "font-medium text-fg")}>{item.fact}</span>
                        <span aria-hidden="true"> · </span>
                        {item.lastTouched}
                      </span>
                    </span>
                  </Link>
                </Hint>

                <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity duration-[120ms] ease-expo group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                  <CourseRowMenu courseId={item.id} topic={item.topic} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
