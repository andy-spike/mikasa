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
import { failDesignRun, startDesignRun } from "@/lib/db/design";
import { findOwnedCourse } from "@/lib/db/courses";
import { requireLearner } from "@/lib/session";
import {
  validateCourseInput,
  type CourseInput,
  type CourseInputErrors,
} from "@/lib/course/limits";
import { designCourseWorkflow } from "@/workflows/course-design";

export type CreateCourseResult =
  | { ok: true; courseId: string }
  | { ok: false; errors: CourseInputErrors };

export type RetryDesignResult =
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
    await failDesignRun(
      db,
      courseId,
      run.id,
      "The design engine could not start this run.",
    );
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
 * Runs design again over a failed Course. Ticket #7 owns the full retry
 * experience; this is the minimal wiring the failure state needs so the
 * button on the progress screen is not a lie.
 */
export async function retryDesignAction(courseId: string): Promise<RetryDesignResult> {
  const { user } = await requireLearner();

  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) return { ok: false, errors: { form: "Course not found." } };

  const errors = await startDesign(course.id);
  if (errors) return { ok: false, errors };
  return { ok: true, courseId: course.id };
}
