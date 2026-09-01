/**
 * The reading side of a published Course (ticket #6): adapters from the
 * current revision's rows to the shapes the Graphite Workspace reads, plus
 * the composition of a Lesson's stored parts into the body the Lesson pane
 * renders.
 *
 * The workspace keeps its own lesson vocabulary (body blocks plus an
 * Exercise); the six generated parts map onto it without new interface:
 * the worked example flows with the prose, the recall and
 * self-explanation prompts read as notes, the bridge closes the Lesson,
 * and the Exercise breaks out the way it always has.
 */
import type { ContentBlock } from "./content";
import type { OutlineData } from "./types";
import type { Course, LessonRow, SourceRow } from "@/lib/db/schema";
import { formatDayStamp } from "@/lib/utils";

/** A block the Lesson pane renders: the generated vocabulary plus the demo's sql block. */
export type ReadingBlock = ContentBlock | { kind: "sql"; code: string };

export type ReadingLesson = {
  /** The stable Outline Lesson id. */
  id: string;
  title: string;
  summary: string;
  minutes: number;
  status: "done" | "set" | "unset";
  stampedOn?: string;
  body: ReadingBlock[];
  exercise?: { task: string; check: string };
};

export type ReadingModule = {
  numeral: string;
  title: string;
  lessons: ReadingLesson[];
};

export type ReadingCourse = {
  id: string;
  topic: string;
  goal: string;
  modules: ReadingModule[];
};

/** A Source as the reading pane links it: by ref, to its URL. */
export type SourceLink = { ref: string; title: string; url: string };

function composeBody(row: LessonRow): ReadingBlock[] {
  return [
    ...row.body,
    ...row.workedExample,
    { kind: "note", title: "Recall", text: row.recallPrompt },
    { kind: "note", title: "Explain it to yourself", text: row.selfExplanationPrompt },
    { kind: "p", text: row.bridge },
  ];
}

/** The reading order follows the Outline the Learner approved. */
export function toReadingCourse(
  course: Course,
  outline: OutlineData,
  lessonRows: LessonRow[],
  completions: Map<string, Date> = new Map(),
): ReadingCourse {
  const byRef = new Map(lessonRows.map((r) => [r.lessonRef, r]));
  return {
    id: course.id,
    topic: course.topic,
    goal: course.goal,
    modules: outline.modules.map((m) => ({
      numeral: m.numeral,
      title: m.title,
      lessons: m.lessons.map((l): ReadingLesson => {
        const row = byRef.get(l.id);
        const done = completions.get(l.id);
        if (!row) {
          /* Publication only happens over a whole candidate, so a missing
             row is unreachable; the Lesson still renders its Outline data
             rather than crashing the workspace. */
          return {
            id: l.id,
            title: l.title,
            summary: l.summary,
            minutes: l.minutes,
            status: "unset",
            body: [],
          };
        }
        return {
          id: l.id,
          title: row.title,
          summary: l.summary,
          minutes: l.minutes,
          status: done ? "done" : "set",
          stampedOn: done ? stampOf(done) : undefined,
          body: composeBody(row),
          exercise: row.exercise,
        };
      }),
    })),
  };
}

/** The day a completion is stamped with, as the interface reads it. */
function stampOf(date: Date): string {
  return formatDayStamp(date);
}

/** Source refs resolve to links; unknown refs render as nothing. */
export function toSourceLinks(rows: SourceRow[]): Map<string, SourceLink> {
  return new Map(rows.map((r) => [r.ref, { ref: r.ref, title: r.title, url: r.url }]));
}
