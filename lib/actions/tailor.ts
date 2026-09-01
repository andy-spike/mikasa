"use server";

/**
 * Tailor actions (tickets #12–#14): reviewing a plan's operations,
 * applying a plan to a pre-generation Outline, and staging a published
 * Course's plan as a new revision. The review changes the plan, never
 * the Course; application and staging are the only doors that do.
 */
import { z } from "zod";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { requireLearner } from "@/lib/session";
import {
  applyPlanToOutline,
  findProposedPlan,
  resumeStagedRevision,
  setOperationStatus,
  stagePlanRevision,
} from "@/lib/db/tailor";
import type { ChangePlanRow } from "@/lib/db/tailor";
import type { PlanView } from "@/components/workspace/panel";
import { opDetail, opEntry, opVerb } from "@/lib/course/change-plan";
import { stageRevisionWorkflow } from "@/workflows/course-revision";
import { failGenerationRun } from "@/lib/db/outline";

const statusSchema = z.object({
  planId: z.string().uuid(),
  operationId: z.string().uuid(),
  status: z.enum(["accepted", "discarded", "proposed"]),
});

const planSchema = z.object({
  courseId: z.string().uuid(),
  planId: z.string().uuid(),
});

export type OperationReviewResult = { ok: boolean; message?: string };

/** The plan as the pane renders it: labels resolved, ids kept. */
function toPlanView(row: ChangePlanRow): PlanView {
  return {
    id: row.id,
    operations: row.operations.map((operation) => ({
      id: operation.id,
      verb: opVerb(operation.payload),
      entry: opEntry(operation.payload),
      detail: opDetail(operation.payload),
      status: operation.status,
    })),
  };
}

/**
 * The plan under review, as the server has it right now. The pane calls
 * this after a turn (one may have been proposed) and whenever a review
 * did not land, so the server's state always wins.
 */
export async function findProposedPlanAction(
  courseId: string,
): Promise<PlanView | null> {
  const { user } = await requireLearner();
  const plan = await findProposedPlan(db, user.id, courseId);
  return plan ? toPlanView(plan) : null;
}

export async function reviewTailorOperationAction(
  planId: string,
  operationId: string,
  status: "accepted" | "discarded" | "proposed",
): Promise<OperationReviewResult> {
  const { user } = await requireLearner();
  const parsed = statusSchema.safeParse({ planId, operationId, status });
  if (!parsed.success) {
    return { ok: false, message: "That review does not fit the plan." };
  }
  return setOperationStatus(
    db,
    user.id,
    parsed.data.planId,
    parsed.data.operationId,
    parsed.data.status,
  );
}

export type ApplyPlanResult =
  | { ok: true; outlineVersion: number; appliedCount: number }
  | { ok: false; reason: string; message: string };

/**
 * Applies a plan's accepted operations to the Outline (#13). The Learner
 * is on the Outline checkpoint: the accepted structure operations go
 * through the manual editor's own change door, all together or not at
 * all, and the specification reads as stale until approval reconciles it.
 */
export async function applyPlanToOutlineAction(
  courseId: string,
  planId: string,
): Promise<ApplyPlanResult> {
  const { user } = await requireLearner();
  const parsed = planSchema.safeParse({ courseId, planId });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "That apply does not fit the plan." };
  }
  return applyPlanToOutline(db, user.id, courseId, parsed.data.planId);
}

export type StageRevisionActionResult =
  | { ok: true; stagedOutlineVersion: number }
  | { ok: false; reason: string; message: string };

/**
 * Stages a published Course's accepted plan as a new revision (#14) and
 * dispatches the durable workflow that regenerates the affected Lessons.
 * The current Course stays readable; publication swaps it atomically when
 * the staged candidate passes review.
 */
export async function stagePlanRevisionAction(
  courseId: string,
  planId: string,
): Promise<StageRevisionActionResult> {
  const { user } = await requireLearner();
  const parsed = planSchema.safeParse({ courseId, planId });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "That stage does not fit the plan." };
  }

  const staged = await stagePlanRevision(db, user.id, courseId, parsed.data.planId);
  if (!staged.ok) return staged;

  try {
    await start(stageRevisionWorkflow, [
      courseId,
      parsed.data.planId,
      staged.runId,
      staged.stagedOutlineVersion,
      staged.baseRevisionNumber,
      staged.regenerateLessonRefs,
      staged.embedLessonRefs,
    ]);
    return { ok: true, stagedOutlineVersion: staged.stagedOutlineVersion };
  } catch {
    await failGenerationRun(
      db,
      courseId,
      staged.runId,
      "The generation engine could not start this revision.",
    );
    return {
      ok: false,
      reason: "dispatch-failed",
      message: "The generation engine could not start this revision. Try again.",
    };
  }
}

/**
 * Re-runs a staged revision whose workflow failed (ticket #7's rules, on
 * a plan): written Lessons are kept, a passed review is kept, and the
 * current Course was never touched by the failure.
 */
export async function retryPlanRevisionAction(
  courseId: string,
  planId: string,
): Promise<StageRevisionActionResult> {
  const { user } = await requireLearner();
  const parsed = planSchema.safeParse({ courseId, planId });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "That retry does not fit the plan." };
  }

  const resume = await resumeStagedRevision(db, user.id, courseId, parsed.data.planId);
  if (!resume.ok) return resume;

  try {
    await start(stageRevisionWorkflow, [
      courseId,
      parsed.data.planId,
      resume.runId,
      resume.stagedOutlineVersion,
      resume.baseRevisionNumber,
      resume.regenerateLessonRefs,
      resume.embedLessonRefs,
    ]);
    return { ok: true, stagedOutlineVersion: resume.stagedOutlineVersion };
  } catch {
    await failGenerationRun(
      db,
      courseId,
      resume.runId,
      "The generation engine could not start this retry.",
    );
    return {
      ok: false,
      reason: "dispatch-failed",
      message: "The generation engine could not start this retry. Try again.",
    };
  }
}
