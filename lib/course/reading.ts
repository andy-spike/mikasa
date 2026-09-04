import type { ContentBlock } from "./content";
import type { OutlineData } from "./types";
import type { Course, LessonRow, SourceRow } from "@/lib/db/schema";
import { formatDayStamp } from "@/lib/utils";

export type ReadingBlock = ContentBlock | { kind: "sql"; code: string };

export type ReadingLesson = {
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

function stampOf(date: Date): string {
  return formatDayStamp(date);
}

export function toSourceLinks(rows: SourceRow[]): Map<string, SourceLink> {
  return new Map(rows.map((r) => [r.ref, { ref: r.ref, title: r.title, url: r.url }]));
}
