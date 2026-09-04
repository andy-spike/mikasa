"use server";

import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { courses, designRuns } from "@/lib/db/schema";
import { failDesignRun, latestDesignRun, startDesignRun } from "@/lib/db/design";
import { failGenerationRun, latestGenerationRun } from "@/lib/db/outline";
import { cancelGenerationRun, resetGenerationRun, currentRevision } from "@/lib/db/review";
import { searchIsIncomplete } from "@/lib/db/fragments";
import { deleteOwnedDesigningCourse, findOwnedCourse } from "@/lib/db/courses";
import { requireLearner } from "@/lib/session";
import { validateCourseInput, type CourseInput, type CourseInputErrors } from "@/lib/course/limits";
import { designCourseWorkflow } from "@/workflows/course-design";
import { generateCourseWorkflow } from "@/workflows/course-generation";
import { repairFragmentsWorkflow } from "@/workflows/repair-fragments";

export type CreateCourseResult =
  | { ok: true; courseId: string }
  | { ok: false; errors: CourseInputErrors };

async function startDesign(courseId: string): Promise<CourseInputErrors | null> {
  const run = await startDesignRun(db, courseId);
  try {
    const started = await start(designCourseWorkflow, [courseId, run.id]);
    await db
      .update(designRuns)
      .set({ workflowRunId: started.runId })
      .where(eq(designRuns.id, run.id));
    return null;
  } catch {
    await failDesignRun(db, courseId, run.id, "The design engine could not start this run.");
    return { form: "Mikasa could not start the design. Try again." };
  }
}

export async function createCourseAction(
  input: Partial<Record<keyof CourseInput, unknown>>,
): Promise<CreateCourseResult> {
  const { user } = await requireLearner();

  const parsed = validateCourseInput(input);
  if (!parsed.ok) return parsed;

  const [course] = await db
    .insert(courses)
    .values({ ownerId: user.id, ...parsed.value })
    .returning();

  const errors = await startDesign(course.id);
  if (errors) return { ok: false, errors };
  return { ok: true, courseId: course.id };
}

export type RetryResult = { ok: true; courseId: string } | { ok: false; errors: CourseInputErrors };

export async function retryCourseAction(courseId: string): Promise<RetryResult> {
  const { user } = await requireLearner();

  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) return { ok: false, errors: { form: "Course not found." } };

  if (course.status !== "failed") {
    return { ok: false, errors: { form: "This Course has nothing to retry." } };
  }

  // A failed generation outranks design: the Course had already reached generation.
  const generation = await latestGenerationRun(db, courseId);
  if (generation && generation.status === "failed") {
    const reopened = await resetGenerationRun(db, courseId, generation.id);
    if (!reopened) {
      return { ok: false, errors: { form: "This run cannot be retried." } };
    }
    try {
      await start(generateCourseWorkflow, [courseId, generation.id, generation.outlineVersion]);
      return { ok: true, courseId };
    } catch {
      await failGenerationRun(
        db,
        courseId,
        generation.id,
        "The generation engine could not start this retry.",
      );
      return {
        ok: false,
        errors: { form: "The generation engine could not start this retry. Try again." },
      };
    }
  }

  const design = await latestDesignRun(db, courseId);
  if (!design) return { ok: false, errors: { form: "This Course has no run to retry." } };
  const RESUMABLE = new Set(["outline", "specification", "persist"]);
  const resumeFrom: "sources" | "outline" | "specification" | "persist" = RESUMABLE.has(
    design.currentStep,
  )
    ? (design.currentStep as "outline" | "specification" | "persist")
    : "sources";

  const newRun = await startDesignRun(db, courseId);
  try {
    const started = await start(designCourseWorkflow, [courseId, newRun.id, resumeFrom]);
    await db
      .update(designRuns)
      .set({ workflowRunId: started.runId })
      .where(eq(designRuns.id, newRun.id));
    return { ok: true, courseId };
  } catch {
    await failDesignRun(db, courseId, newRun.id, "The design engine could not start this retry.");
    return {
      ok: false,
      errors: { form: "The design engine could not start this retry. Try again." },
    };
  }
}

export type CancelResult = { ok: true } | { ok: false; reason: "not-found" | "too-late" };

/**
 * Discards a Course that is still designing. The in-flight workflow stops
 * at its next step boundary; a design that finished first is kept and
 * reported as too late so the learner lands on the Outline instead.
 */
export async function cancelDesignAction(courseId: string): Promise<CancelResult> {
  const { user } = await requireLearner();
  return deleteOwnedDesigningCourse(db, user.id, courseId);
}

/**
 * Stops an in-flight generation and returns the Course to its Outline
 * checkpoint. The approved Outline and specification stay; partial
 * candidate Lessons and review work go, so a later approval starts fresh.
 */
export async function cancelGenerationAction(courseId: string): Promise<CancelResult> {
  const { user } = await requireLearner();
  return cancelGenerationRun(db, user.id, courseId);
}

export type RebuildFragmentsResult = { ok: boolean; message?: string };

export async function rebuildFragmentsAction(courseId: string): Promise<RebuildFragmentsResult> {
  const { user } = await requireLearner();
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) return { ok: false, message: "Course not found." };

  const revision = await currentRevision(db, courseId);
  if (!revision) {
    return { ok: false, message: "This Course has no published revision yet." };
  }

  try {
    await start(repairFragmentsWorkflow, [courseId, revision.outlineVersion]);
    return { ok: true };
  } catch {
    return { ok: false, message: "The rebuild could not start. Try again." };
  }
}

export async function searchIsIncompleteAction(courseId: string): Promise<boolean> {
  const { user } = await requireLearner();
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) return false;
  return searchIsIncomplete(db, courseId);
}
