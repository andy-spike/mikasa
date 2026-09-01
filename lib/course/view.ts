/**
 * Adapters from DB rows to the shapes the existing interface reads. The
 * Outline editor keeps its own vocabulary (`LibraryCourse`); feeding it
 * real data must not mean redesigning it.
 */
import { DEPTH_CHOICES } from "./limits";
import type { OutlineData } from "./types";
import type { Course } from "@/lib/db/schema";
import type { LibraryCourse } from "@/lib/demo-library";

/** The Depth's display title, as the form offered it. */
export function depthLabel(depth: string): string {
  return DEPTH_CHOICES.find((d) => d.id === depth)?.title ?? depth;
}

function shortDate(date: Date): string {
  return date
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    .toUpperCase();
}

/**
 * A designed Course, as the Outline editor reads it. Lessons are `unset`
 * (no content exists yet), and there is no Tailor plan until that ticket
 * exists — the editor's plan UI simply shows nothing pending.
 */
export function outlineToLibraryCourse(
  course: Course,
  outline: OutlineData,
): LibraryCourse {
  return {
    id: course.id,
    topic: course.topic,
    goal: course.goal,
    depth: depthLabel(course.depth),
    background: course.background,
    grounding: course.grounding,
    phase: "outline",
    createdOn: shortDate(course.createdAt),
    openedOn: shortDate(course.updatedAt),
    modules: outline.modules.map((m) => ({
      numeral: m.numeral,
      title: m.title,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        summary: l.summary,
        minutes: l.minutes,
        status: "unset" as const,
      })),
    })),
    plan: [],
  };
}
