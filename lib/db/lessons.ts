/**
 * Repositories for the generated candidate (ticket #5). Lesson rows are
 * keyed to their stable Outline lesson id and the Outline version they
 * were written for, so a regenerated revision (ticket #14) is new rows,
 * never an overwrite of what the Learner may be reading.
 *
 * The Workflow passes the server-side Course id; Learner-facing reads go
 * through published revisions only (ticket #6), so an unpublished
 * candidate has no reading path at all.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "./index";
import {
  courses,
  courseSpecs,
  generationRuns,
  lessons,
  outlines,
  sources,
} from "./schema";
import type { LessonContent, ContentBlock } from "../course/content";
import { parseLessonContent } from "../course/content";
import type { CourseSpecification } from "../course/types";
import { newLessonSourceRef, type PromptSource } from "../course/generate";

/** The context one generation run needs, loaded server-side. */
export type GenerationContext = {
  course: {
    id: string;
    topic: string;
    goal: string;
    background: string;
    language: string;
    depth: string;
    grounding: boolean;
  };
  spec: CourseSpecification;
  outline: {
    version: number;
    data: {
      modules: {
        id: string;
        ordinal: number;
        numeral: string;
        title: string;
        lessons: { id: string; ordinal: number; title: string; summary: string; minutes: number }[];
      }[];
    };
  };
  sources: PromptSource[];
  /** Lesson ids already written for this Outline version (a resumed run). */
  written: string[];
};

export async function loadGenerationContext(
  db: Db,
  courseId: string,
  outlineVersion: number,
): Promise<GenerationContext | undefined> {
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) return undefined;

  const [outline] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, outlineVersion)))
    .limit(1);
  if (!outline) return undefined;

  const [specRow] = await db
    .select()
    .from(courseSpecs)
    .where(
      and(
        eq(courseSpecs.courseId, courseId),
        eq(courseSpecs.outlineVersion, outlineVersion),
      ),
    )
    .limit(1);
  if (!specRow) return undefined;

  const sourceRows = await db
    .select()
    .from(sources)
    .where(eq(sources.courseId, courseId));
  const written = await db
    .select({ lessonRef: lessons.lessonRef })
    .from(lessons)
    .where(
      and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)),
    );

  return {
    course: {
      id: course.id,
      topic: course.topic,
      goal: course.goal,
      background: course.background,
      language: course.language,
      depth: course.depth,
      grounding: course.grounding,
    },
    spec: specRow.spec,
    outline: { version: outline.version, data: outline.data },
    sources: sourceRows.map((s) => ({
      ref: s.ref,
      title: s.title,
      url: s.url,
      excerpt: s.excerpt,
    })),
    written: written.map((w) => w.lessonRef),
  };
}

/** Writes one Lesson's content and records the run's progress. */
export async function saveLessonContent(
  db: Db,
  courseId: string,
  outlineVersion: number,
  runId: string,
  content: LessonContent,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(lessons)
      .values({
        courseId,
        outlineVersion,
        lessonRef: content.lessonId,
        title: content.title,
        body: content.body,
        workedExample: content.workedExample,
        recallPrompt: content.recallPrompt,
        selfExplanationPrompt: content.selfExplanationPrompt,
        exercise: content.exercise,
        bridge: content.bridge,
      })
      .onConflictDoUpdate({
        target: [lessons.courseId, lessons.outlineVersion, lessons.lessonRef],
        set: {
          title: content.title,
          body: content.body,
          workedExample: content.workedExample,
          recallPrompt: content.recallPrompt,
          selfExplanationPrompt: content.selfExplanationPrompt,
          exercise: content.exercise,
          bridge: content.bridge,
          updatedAt: new Date(),
        },
      });

    await tx
      .update(generationRuns)
      .set({ currentStep: `lesson:${content.lessonId}`, updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
  });
}

/** Persists a Source found by a Lesson-specific lookup, deduped by URL. */
export async function saveLessonSource(
  db: Db,
  courseId: string,
  source: { title: string; url: string; excerpt: string },
  newRef: () => string = newLessonSourceRef,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.courseId, courseId), eq(sources.url, source.url)))
    .limit(1);
  if (existing) return existing.ref;

  const [row] = await db
    .insert(sources)
    .values({
      courseId,
      ref: newRef(),
      title: source.title,
      url: source.url,
      fetchedAt: new Date(),
      excerpt: source.excerpt,
    })
    .returning();
  return row.ref;
}

/**
 * Closes the run when the candidate is whole: every planned Lesson exists
 * for this Outline version. The Course moves to "reviewing" — review
 * itself is ticket #6.
 */
export async function finishGeneration(
  db: Db,
  courseId: string,
  outlineVersion: number,
  runId: string,
  options?: { promoteCourse?: boolean },
): Promise<{ ok: boolean; missing: number }> {
  const [outline] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, outlineVersion)))
    .limit(1);
  if (!outline) return { ok: false, missing: -1 };

  const planned = outline.data.modules.flatMap((m) => m.lessons.map((l) => l.id));
  const written = await db
    .select({ lessonRef: lessons.lessonRef })
    .from(lessons)
    .where(
      and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)),
    );
  const writtenSet = new Set(written.map((w) => w.lessonRef));
  const missing = planned.filter((id) => !writtenSet.has(id));

  if (missing.length > 0) {
    await db
      .update(generationRuns)
      .set({
        status: "failed",
        error: `Generation stopped with ${missing.length} Lesson(s) unwritten.`,
        updatedAt: new Date(),
      })
      .where(eq(generationRuns.id, runId));
    return { ok: false, missing: missing.length };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(generationRuns)
      .set({ status: "succeeded", currentStep: "complete", updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
    /* A staged revision (ticket #14) finishes its run without touching
       the Course: it is published and stays readable throughout. */
    if (options?.promoteCourse === false) return;
    await tx
      .update(courses)
      .set({ status: "reviewing", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });
  return { ok: true, missing: 0 };
}

/** A failed run keeps its message and the Course stays retryable (ticket #7). */
export async function failGeneration(
  db: Db,
  courseId: string,
  runId: string,
  message: string,
  options?: { touchCourse?: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(generationRuns)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
    /* A staged revision (ticket #14) fails without touching the Course:
       the published Course stays on duty and the plan stays retryable. */
    if (options?.touchCourse === false) return;
    await tx
      .update(courses)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });
}

/** Lesson rows for one Outline version, keyed by their Outline lesson id. */
export async function getLessonsForVersion(
  db: Db,
  courseId: string,
  outlineVersion: number,
): Promise<
  {
    lessonRef: string;
    title: string;
    body: ContentBlock[];
    workedExample: ContentBlock[];
    recallPrompt: string;
    selfExplanationPrompt: string;
    exercise: { task: string; check: string };
    bridge: string;
  }[]
> {
  const rows = await db
    .select()
    .from(lessons)
    .where(
      and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)),
    );
  return rows.map((r) => ({
    lessonRef: r.lessonRef,
    title: r.title,
    body: r.body,
    workedExample: r.workedExample,
    recallPrompt: r.recallPrompt,
    selfExplanationPrompt: r.selfExplanationPrompt,
    exercise: r.exercise,
    bridge: r.bridge,
  }));
}

/** The candidate as review and correction consume it, in Outline order. */
export async function getLessonContentsForVersion(
  db: Db,
  courseId: string,
  outlineVersion: number,
): Promise<LessonContent[]> {
  const [outline] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, outlineVersion)))
    .limit(1);
  if (!outline) return [];

  const rows = await db
    .select()
    .from(lessons)
    .where(
      and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)),
    );
  const byRef = new Map(rows.map((r) => [r.lessonRef, r]));
  const planned = outline.data.modules.flatMap((m) => m.lessons.map((l) => l.id));

  return planned
    .map((ref) => byRef.get(ref))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) =>
      parseLessonContent(r.lessonRef, r.title, {
        body: r.body,
        workedExample: r.workedExample,
        recallPrompt: r.recallPrompt,
        selfExplanationPrompt: r.selfExplanationPrompt,
        exercise: r.exercise,
        bridge: r.bridge,
      }),
    );
}
