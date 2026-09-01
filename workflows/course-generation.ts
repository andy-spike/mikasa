/**
 * Durable Course generation (ADR 0005), started by Outline approval
 * (ticket #4). One Workflow step per Lesson: a failure costs one Lesson's
 * work, and the engine's step memoization means a retry (ticket #7)
 * resumes from the first unwritten Lesson, not from zero.
 *
 * This file owns only the Workflow shape; everything substantive lives in
 * `lib/course/generate` (plain functions, injected providers) and
 * `lib/db/lessons` (state).
 */
import type { LessonContent } from "@/lib/course/content";
import type { PromptSource } from "@/lib/course/generate";
import type { GenerationContext } from "@/lib/db/lessons";
import type { OutlineLesson } from "@/lib/course/types";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "Course generation failed.";
}

async function stepLoadContext(
  courseId: string,
  outlineVersion: number,
): Promise<GenerationContext | null> {
  "use step";
  const { loadGenerationContext } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  const context = await loadGenerationContext(db, courseId, outlineVersion);
  return context ?? null;
}

async function stepMarkStep(runId: string, step: string): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { generationRuns } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db
    .update(generationRuns)
    .set({ currentStep: step, updatedAt: new Date() })
    .where(eq(generationRuns.id, runId));
}

/** The declared order for this Outline version; a broken graph fails here. */
async function stepOrder(context: GenerationContext): Promise<OutlineLesson[]> {
  "use step";
  const { generationOrder } = await import("@/lib/course/generate");
  return generationOrder(context.spec, context.outline.data);
}

/**
 * One Lesson: decide whether it needs a Lesson-specific Source (only when
 * Grounding is on), fetch and store it if so, then write and persist the
 * Lesson. The new Source's ref rides back so the next lessons' prompts
 * can cite it too.
 */
async function stepGenerateLesson(
  context: GenerationContext,
  runId: string,
  lesson: OutlineLesson,
  nextLesson: OutlineLesson | null,
  priorLessons: { title: string; summary: string }[],
  extraSources: PromptSource[],
): Promise<{ content: LessonContent; newSource?: PromptSource }> {
  "use step";
  const { db } = await import("@/lib/db");
  const {
    planLessonSource,
    generateLesson,
    LESSON_SOURCE_LIMIT,
  } = await import("@/lib/course/generate");
  const { saveLessonContent, saveLessonSource } = await import("@/lib/db/lessons");
  const { generationModel } = await import("@/lib/model");
  const { firecrawlSearcher } = await import("@/lib/course/design");

  const model = generationModel();
  const sources = [...context.sources, ...extraSources];

  const plan = await planLessonSource(
    model,
    context.course,
    {
      title: lesson.title,
      summary: lesson.summary,
      performance: context.spec.alignment.find((a) => a.lessonId === lesson.id)
        ?.performance,
    },
    sources,
  );

  let newSource: PromptSource | undefined;
  if (plan.needsSource && plan.query) {
    const pages = await firecrawlSearcher()(plan.query, LESSON_SOURCE_LIMIT);
    const page = pages[0];
    if (page && page.content.trim().length > 0) {
      const excerpt = page.content.slice(0, 600).trim();
      const ref = await saveLessonSource(db, context.course.id, {
        title: page.title,
        url: page.url,
        excerpt,
      });
      newSource = { ref, title: page.title, url: page.url, excerpt };
    }
  }

  const content = await generateLesson(model, {
    course: context.course,
    spec: context.spec,
    lesson,
    nextLesson,
    priorLessons,
    sources: newSource ? [...sources, newSource] : sources,
  });

  await saveLessonContent(db, context.course.id, context.outline.version, runId, content);
  return { content, newSource };
}

async function stepFinish(
  courseId: string,
  outlineVersion: number,
  runId: string,
): Promise<{ ok: boolean; missing: number }> {
  "use step";
  const { finishGeneration } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  return finishGeneration(db, courseId, outlineVersion, runId);
}

async function stepFail(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failGeneration } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  await failGeneration(db, courseId, runId, message);
}

/**
 * One full generation pass over an approved Outline version: load, order,
 * write every Lesson in dependency order (Module by Module — the Outline's
 * order within a Module is the Learner's approved order), then close the
 * run only if the candidate is whole.
 */
export async function generateCourseWorkflow(
  courseId: string,
  runId: string,
  outlineVersion: number,
) {
  "use workflow";

  const context = await stepLoadContext(courseId, outlineVersion);
  if (!context) {
    await stepFail(courseId, runId, "The Course to generate no longer exists.");
    return { ok: false as const, reason: "course-not-found" };
  }

  try {
    const order = await stepOrder(context);
    await stepMarkStep(runId, "lessons");

    const extraSources: PromptSource[] = [];
    const priorLessons: { title: string; summary: string }[] = [];

    for (let i = 0; i < order.length; i++) {
      const { newSource } = await stepGenerateLesson(
        context,
        runId,
        order[i],
        order[i + 1] ?? null,
        priorLessons,
        extraSources,
      );
      if (newSource) extraSources.push(newSource);
      priorLessons.push({ title: order[i].title, summary: order[i].summary });
    }

    const finished = await stepFinish(courseId, outlineVersion, runId);
    return finished.ok
      ? { ok: true as const }
      : { ok: false as const, reason: "incomplete-candidate", missing: finished.missing };
  } catch (error) {
    await stepFail(courseId, runId, errorMessage(error));
    return { ok: false as const, reason: "generation-failed" };
  }
}
