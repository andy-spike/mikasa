import { and, eq } from "drizzle-orm";
import type { Db } from "./index";
import { courses, courseSpecs, generationRuns, lessons, outlines, sources } from "./schema";
import type { LessonContent, ContentBlock } from "../course/content";
import { parseLessonContent } from "../course/content";
import type { CourseSpecification } from "../course/types";
import { outlineLessonRefs } from "../course/structure";
import { newLessonSourceRef, type PromptSource } from "../course/generate";

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
  written: string[];
};

export async function loadGenerationContext(
  db: Db,
  courseId: string,
  outlineVersion: number,
): Promise<GenerationContext | undefined> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
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
    .where(and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, outlineVersion)))
    .limit(1);
  if (!specRow) return undefined;

  const sourceRows = await db.select().from(sources).where(eq(sources.courseId, courseId));
  const written = await db
    .select({ lessonRef: lessons.lessonRef })
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)));

  const { id, topic, goal, background, language, depth, grounding } = course;
  return {
    course: { id, topic, goal, background, language, depth, grounding },
    spec: specRow.spec,
    outline: { version: outline.version, data: outline.data },
    sources: sourceRows.map(({ ref, title, url, excerpt }) => ({ ref, title, url, excerpt })),
    written: written.map((w) => w.lessonRef),
  };
}

export async function saveLessonContent(
  db: Db,
  courseId: string,
  outlineVersion: number,
  runId: string,
  content: LessonContent,
  options?: { touchRun?: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    // The generation run is the authority for candidate writes. Check its
    // existence first, in the same locking order as cancellation (run row
    // before candidate rows), so a late write cannot recreate cancelled data.
    const [run] = await tx
      .select({ id: generationRuns.id })
      .from(generationRuns)
      .where(eq(generationRuns.id, runId))
      .limit(1);
    if (!run) {
      throw new Error("The generation run is gone; discarding this Lesson write.");
    }
    const { lessonId: lessonRef, ...fields } = content;
    await tx
      .insert(lessons)
      .values({ courseId, outlineVersion, lessonRef, ...fields })
      .onConflictDoUpdate({
        target: [lessons.courseId, lessons.outlineVersion, lessons.lessonRef],
        set: { ...fields, updatedAt: new Date() },
      });

    /* Corrections must not move the run marker back to a Lesson: the
       workflow already recorded corrections:N, and the progress UI reads it. */
    if (options?.touchRun === false) return;
    await tx
      .update(generationRuns)
      .set({ currentStep: `lesson:${content.lessonId}`, updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
  });
}

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

  // Parallel waves can fetch the same URL twice: the unique index decides
  // the winner, and the loser rereads the winning row instead of failing.
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
    .onConflictDoNothing({ target: [sources.courseId, sources.url] })
    .returning();
  if (row) return row.ref;

  const [raced] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.courseId, courseId), eq(sources.url, source.url)))
    .limit(1);
  if (raced) return raced.ref;
  throw new Error("The Source was saved by another Lesson but cannot be read back.");
}

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

  const planned = outlineLessonRefs(outline.data);
  const written = await db
    .select({ lessonRef: lessons.lessonRef })
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)));
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

  // The run stays active through review and publication; it succeeds only
  // when publication succeeds. Record progress without closing the run.
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select({ id: generationRuns.id })
      .from(generationRuns)
      .where(eq(generationRuns.id, runId))
      .limit(1);
    if (!run) return;
    await tx
      .update(generationRuns)
      .set({ currentStep: "lessons-complete", updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
    /* A staged revision finishes without touching the Course. */
    if (options?.promoteCourse === false) return;
    await tx
      .update(courses)
      .set({ status: "reviewing", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });
  return { ok: true, missing: 0 };
}

export async function succeedGenerationRun(db: Db, runId: string): Promise<void> {
  await db
    .update(generationRuns)
    .set({ status: "succeeded", currentStep: "complete", updatedAt: new Date() })
    .where(eq(generationRuns.id, runId));
}

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
    if (options?.touchCourse === false) return;
    await tx
      .update(courses)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });
}

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
    .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)));
  return rows.map(
    ({
      lessonRef,
      title,
      body,
      workedExample,
      recallPrompt,
      selfExplanationPrompt,
      exercise,
      bridge,
    }) => ({
      lessonRef,
      title,
      body,
      workedExample,
      recallPrompt,
      selfExplanationPrompt,
      exercise,
      bridge,
    }),
  );
}

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
    .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)));
  const byRef = new Map(rows.map((r) => [r.lessonRef, r]));
  const planned = outlineLessonRefs(outline.data);

  return planned.flatMap((ref) => {
    const r = byRef.get(ref);
    return r
      ? [
          parseLessonContent(r.lessonRef, r.title, {
            body: r.body,
            workedExample: r.workedExample,
            recallPrompt: r.recallPrompt,
            selfExplanationPrompt: r.selfExplanationPrompt,
            exercise: r.exercise,
            bridge: r.bridge,
          }),
        ]
      : [];
  });
}
