import "server-only";

import type { LessonRow } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { replaceCourseFragments } from "@/lib/db/fragments";
import type { ContentBlock } from "./content";
import type { FragmentInput } from "@/lib/db/fragments";

type FragmentSource = Pick<
  LessonRow,
  | "lessonRef"
  | "title"
  | "body"
  | "workedExample"
  | "exercise"
  | "recallPrompt"
  | "selfExplanationPrompt"
>;

function blockText(block: ContentBlock): string {
  switch (block.kind) {
    case "p":
      return block.text;
    case "code":
      return `Code (${block.language}):\n${block.code}`;
    case "note":
      return `${block.title}: ${block.text}`;
    case "table":
      return [block.caption, block.head.join(" | "), ...block.rows.map((r) => r.join(" | "))]
        .filter(Boolean)
        .join("\n");
  }
}

export function buildLessonFragments(row: FragmentSource): FragmentInput[] {
  const blocks: ContentBlock[] = [...row.body, ...row.workedExample];
  const fragments: FragmentInput[] = [];
  let ordinal = 0;

  const prefix = `Lesson: ${row.title}`;
  const push = (text: string) => {
    fragments.push({ lessonRef: row.lessonRef, ordinal: ordinal++, content: text });
  };

  push(prefix);
  for (const block of blocks) {
    push(`${prefix}\n${blockText(block)}`);
  }
  push(`${prefix}\nExercise: ${row.exercise.task}\nDone when: ${row.exercise.check}`);
  push(
    `${prefix}\nRecall from memory: ${row.recallPrompt}\nExplain why: ${row.selfExplanationPrompt}`,
  );
  return fragments;
}

export function buildCourseFragments(rows: FragmentSource[]): FragmentInput[] {
  return rows.flatMap(buildLessonFragments);
}

async function loadLessonsForVersion(db: Db, courseId: string, outlineVersion: number) {
  const { getLessonsForVersion } = await import("@/lib/db/lessons");
  return getLessonsForVersion(db, courseId, outlineVersion);
}

export async function embedCourseFragments(
  db: Db,
  embedTexts: (texts: string[]) => Promise<number[][]>,
  courseId: string,
  outlineVersion: number,
): Promise<number> {
  const rows = await loadLessonsForVersion(db, courseId, outlineVersion);
  const fragments = buildCourseFragments(rows);
  if (fragments.length === 0) return 0;
  const embeddings = await embedTexts(fragments.map((f) => f.content));
  await replaceCourseFragments(db, courseId, fragments, embeddings);
  return fragments.length;
}

export async function embedLessonFragments(
  db: Db,
  embedTexts: (texts: string[]) => Promise<number[][]>,
  courseId: string,
  outlineVersion: number,
  lessonRefs: string[],
): Promise<number> {
  const { replaceLessonFragments } = await import("@/lib/db/fragments");
  const wanted = new Set(lessonRefs);
  const rows = (await loadLessonsForVersion(db, courseId, outlineVersion)).filter((r) =>
    wanted.has(r.lessonRef),
  );
  const fragments = buildCourseFragments(rows);
  if (fragments.length === 0) {
    await replaceLessonFragments(db, courseId, lessonRefs, fragments, []);
    return 0;
  }
  const embeddings = await embedTexts(fragments.map((f) => f.content));
  await replaceLessonFragments(db, courseId, lessonRefs, fragments, embeddings);
  return fragments.length;
}
