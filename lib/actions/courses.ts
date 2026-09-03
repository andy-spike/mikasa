"use server";

/**
 * Course actions. Thin on purpose: authorize, validate, delegate —
 * `lib/course/limits` owns the rules, `lib/db/design` owns state, and the
 * Workflow engine owns the durable run (ADR 0005).
 */
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { courses, designRuns } from "@/lib/db/schema";
import { failDesignRun, latestDesignRun, startDesignRun } from "@/lib/db/design";
import { failGenerationRun, latestGenerationRun } from "@/lib/db/outline";
import { resetGenerationRun, currentRevision } from "@/lib/db/review";
import { searchIsIncomplete } from "@/lib/db/fragments";
import { findOwnedCourse } from "@/lib/db/courses";
import { requireLearner } from "@/lib/session";
import { validateCourseInput, type CourseInput, type CourseInputErrors } from "@/lib/course/limits";
import { designCourseWorkflow } from "@/workflows/course-design";
import { generateCourseWorkflow } from "@/workflows/course-generation";
import { repairFragmentsWorkflow } from "@/workflows/repair-fragments";

export type CreateCourseResult =
  | { ok: true; courseId: string }
  | { ok: false; errors: CourseInputErrors };

/**
 * Hands the Course to the design engine and links the workflow run to the
 * design-run row. If the engine cannot take the run (misconfigured
 * deployment), the run fails visibly and stays retryable.
 */
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

/**
 * Creates a Course owned by the signed-in Learner and starts its durable
 * design. The Learner leaves this action long before the Outline exists.
 */
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

/**
 * Runs work again over a failed Course: the dispatching retry of ticket
 * #7. The stage the failure came from decides what runs again — design
 * resumes past its persisted steps; generation keeps written Lessons and
 * a passed review; nothing valid is regenerated.
 */
export type RetryResult = { ok: true; courseId: string } | { ok: false; errors: CourseInputErrors };

export async function retryCourseAction(courseId: string): Promise<RetryResult> {
  const { user } = await requireLearner();

  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) return { ok: false, errors: { form: "Course not found." } };

  if (course.status !== "failed") {
    return { ok: false, errors: { form: "This Course has nothing to retry." } };
  }

  /* A failed generation (lessons, review, publication) outranks design:
     it means the Course had already reached the generation stage. */
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

  /* A design that failed before anything persisted starts over; one that
     failed later resumes past its persisted steps. */
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

/**
 * Rebuilds the current revision's Tutor search index (bug 9). The
 * published Course is never touched: the durable repair re-embeds the
 * revision's fragments and records the outcome on the run.
 */
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

/**
 * Whether the current revision's Tutor search is out of date (bug 9).
 * The Workspace's rebuild strip polls this while a repair is running.
 */
export async function searchIsIncompleteAction(courseId: string): Promise<boolean> {
  const { user } = await requireLearner();
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) return false;
  return searchIsIncomplete(db, courseId);
}
