import { outlineLessonRefs } from "./structure";
import { formatDayStamp, formatLastTouched } from "@/lib/utils";
import type { OutlineData } from "./types";

/**
 * The Courses page in one pass: the library's rows, the fact each row
 * carries, the Course the pane opens with, and the one action that Course
 * needs. Everything here is derived from published state; the page renders
 * it and the client component filters it.
 */

export type CourseLibraryGroup = "needs" | "in-progress" | "done";

export type CourseLibraryState =
  | "resume"
  | "complete"
  | "outline-ready"
  | "changes"
  | "retry"
  | "designing"
  | "writing"
  | "reviewing"
  | "revising";

export type CourseLibraryPosition = {
  moduleNumeral: string;
  moduleTitle: string;
  lesson: number;
  total: number;
};

export type CourseLibraryItem = {
  id: string;
  topic: string;
  goal: string;
  group: CourseLibraryGroup;
  state: CourseLibraryState;
  /** The row's right-hand column: the completion fraction, or the state word. */
  fact: string;
  /** The pane's sentence for a Course that is not being read. */
  detail: string;
  /** The pane's quiet line under the action. */
  note: string;
  actionLabel: string;
  href: string;
  lastTouched: string;
  nextLessonTitle: string | null;
  nextLessonMinutes: number | null;
  position: CourseLibraryPosition | null;
  /** Exactly one row carries the live mark: the Course the pane opens with. */
  isLive: boolean;
};

/** One Course as the library sees it: published outline, completions, and any plan in flight. */
export type CourseLibraryInput = {
  id: string;
  topic: string;
  goal: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  /** The published revision's Outline, when there is one. */
  outline: OutlineData | null;
  completions: { lessonRef: string; doneAt: Date }[];
  plan: "proposed" | "staged" | null;
  proposedChanges: number;
};

const GROUP_ORDER: CourseLibraryGroup[] = ["needs", "in-progress", "done"];

export const GROUP_LABELS: Record<CourseLibraryGroup, string> = {
  needs: "Needs you",
  "in-progress": "In progress",
  done: "Done",
};

function publishedHref(id: string): string {
  return `/courses/${id}`;
}

function outlineHref(id: string): string {
  return `/courses/${id}/outline`;
}

/**
 * The first Lesson the learner has not marked, with the module it sits in
 * and its position in the Course — the fact behind "Continue".
 */
function nextLessonFor(
  outline: OutlineData,
  done: Set<string>,
): {
  title: string;
  minutes: number;
  position: CourseLibraryPosition;
} | null {
  const total = outlineLessonRefs(outline).length;
  let seen = 0;
  for (const mod of outline.modules) {
    for (const lesson of mod.lessons) {
      seen += 1;
      if (!done.has(lesson.id)) {
        return {
          title: lesson.title,
          minutes: lesson.minutes,
          position: {
            moduleNumeral: mod.numeral,
            moduleTitle: mod.title,
            lesson: seen,
            total,
          },
        };
      }
    }
  }
  return null;
}

function toItem(input: CourseLibraryInput, now: Date): CourseLibraryItem {
  const outline = input.outline;
  const refs = outline ? outlineLessonRefs(outline) : [];
  const refSet = new Set(refs);
  const doneRows = input.completions.filter((c) => refSet.has(c.lessonRef));
  const doneCount = doneRows.length;
  const total = refs.length;
  const complete = total > 0 && doneCount === total;
  const lastDoneAt = doneRows.reduce<Date | null>(
    (latest, row) => (!latest || row.doneAt > latest ? row.doneAt : latest),
    null,
  );
  const lastTouchedAt = lastDoneAt ?? input.updatedAt;
  const lastTouched = formatLastTouched(lastTouchedAt, now);
  const done = new Set(doneRows.map((row) => row.lessonRef));
  const next = outline && !complete ? nextLessonFor(outline, done) : null;
  const base = {
    id: input.id,
    topic: input.topic,
    goal: input.goal,
    lastTouched,
    nextLessonTitle: next?.title ?? null,
    nextLessonMinutes: next?.minutes ?? null,
    position: next?.position ?? null,
    isLive: false,
  };

  if (input.status === "failed") {
    return {
      ...base,
      group: "needs",
      state: "retry",
      fact: "Build failed",
      detail:
        "The build failed before this Course was complete. Nothing valid was lost — the drafts were kept.",
      note: `Last activity ${lastTouched}`,
      actionLabel: "See what failed",
      href: outlineHref(input.id),
    };
  }

  if (input.status === "awaiting-outline-approval") {
    return {
      ...base,
      group: "needs",
      state: "outline-ready",
      fact: "Outline ready",
      detail:
        "The Outline is ready to review. Change anything you want, then approve it and Mikasa writes the Lessons.",
      note: `Drafted ${lastTouched.toLowerCase()}`,
      actionLabel: "Review the Outline",
      href: outlineHref(input.id),
    };
  }

  if (input.status === "designing") {
    return {
      ...base,
      group: "in-progress",
      state: "designing",
      fact: "Designing",
      detail: "Mikasa is drafting the Outline from your Topic and Goal.",
      note: `Started ${lastTouched.toLowerCase()}`,
      actionLabel: "View progress",
      href: outlineHref(input.id),
    };
  }

  if (input.status === "generating") {
    return {
      ...base,
      group: "in-progress",
      state: "writing",
      fact: "Writing Lessons",
      detail: "Mikasa is writing the Lessons, one at a time, in reading order.",
      note: `Started ${lastTouched.toLowerCase()}`,
      actionLabel: "View progress",
      href: outlineHref(input.id),
    };
  }

  if (input.status === "reviewing") {
    return {
      ...base,
      group: "in-progress",
      state: "reviewing",
      fact: "Reviewing",
      detail: "Mikasa is reviewing the written Lessons for structure and accuracy.",
      note: `Started ${lastTouched.toLowerCase()}`,
      actionLabel: "View progress",
      href: outlineHref(input.id),
    };
  }

  if (input.plan === "proposed") {
    const changes = input.proposedChanges;
    return {
      ...base,
      group: "needs",
      state: "changes",
      fact: "Changes to review",
      detail:
        changes === 1
          ? "One change from the Tailor waits for your decision."
          : `${changes} changes from the Tailor wait for your decision.`,
      note: "The Course stays readable while you decide.",
      actionLabel: "Review the changes",
      href: publishedHref(input.id),
    };
  }

  if (complete) {
    return {
      ...base,
      group: "done",
      state: "complete",
      fact: `${doneCount} / ${total}`,
      detail: "Every Lesson of this Course is complete.",
      note: input.completedAt
        ? `Completed ${formatDayStamp(input.completedAt)}`
        : `Last touched ${lastTouched.toLowerCase()}`,
      actionLabel: "Open the Course",
      href: publishedHref(input.id),
    };
  }

  if (input.plan === "staged") {
    return {
      ...base,
      group: "in-progress",
      state: "revising",
      fact: `${doneCount} / ${total}`,
      detail:
        "A revision is being prepared from the changes you approved. Keep reading — the Course stays as it is until it publishes.",
      note: `Last touched ${lastTouched.toLowerCase()}`,
      actionLabel: "Continue",
      href: publishedHref(input.id),
    };
  }

  return {
    ...base,
    group: "in-progress",
    state: "resume",
    fact: `${doneCount} / ${total}`,
    detail: "",
    note: `Last touched ${lastTouched.toLowerCase()}`,
    actionLabel: "Continue",
    href: publishedHref(input.id),
  };
}

/**
 * Rows in reading order: what needs the learner first, then what is in
 * flight, then what is done. Within a group, the most recently touched
 * Course leads; the done group orders by when it was finished.
 */
export function buildCourseLibrary(
  rows: CourseLibraryInput[],
  now: Date = new Date(),
): CourseLibraryItem[] {
  const ordered = rows.map((row) => {
    const lastDone = row.completions.reduce(
      (latest, completion) => Math.max(latest, completion.doneAt.getTime()),
      0,
    );
    return {
      item: toItem(row, now),
      touched: Math.max(lastDone, row.updatedAt.getTime()),
      finished: row.completedAt?.getTime() ?? 0,
    };
  });

  ordered.sort((a, b) => {
    const byGroup = GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group);
    if (byGroup !== 0) return byGroup;
    if (a.item.group === "done") return b.finished - a.finished || b.touched - a.touched;
    return b.touched - a.touched;
  });

  const live =
    ordered.find((entry) => entry.item.state === "resume") ??
    ordered.find((entry) => entry.item.state === "revising") ??
    ordered.find((entry) => entry.item.state === "complete") ??
    ordered[0];

  return ordered.map((entry) =>
    entry === live ? { ...entry.item, isLive: true } : entry.item,
  );
}
