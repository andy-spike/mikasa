"use server";

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { requireLearner } from "@/lib/session";
import { courses, generationRuns } from "@/lib/db/schema";
import {
  applyPlanToOutline,
  discardStagedRevision,
  findProposedPlan,
  findStagedPlan,
  listPlansWithOperations,
  resumeStagedRevision,
  setOperationStatus,
  stagePlanRevision,
  undoPlanRevision,
} from "@/lib/db/tailor";
import type { ChangePlanRow } from "@/lib/db/tailor";
import type { PlanView } from "@/components/workspace/panel";
import { opDetail, opEntry, opVerb } from "@/lib/course/change-plan";
import { stageRevisionWorkflow } from "@/workflows/course-revision";
import { repairFragmentsWorkflow } from "@/workflows/repair-fragments";
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

export async function findProposedPlanAction(courseId: string): Promise<PlanView | null> {
  const { user } = await requireLearner();
  const plan = await findProposedPlan(db, user.id, courseId);
  return plan ? toPlanView(plan) : null;
}

export type StagedPlanView = {
  plan: PlanView;
  failed: boolean;
  error: string | null;
  stage: string | null;
};

export async function findStagedPlanAction(courseId: string): Promise<StagedPlanView | null> {
  const { user } = await requireLearner();
  const plan = await findStagedPlan(db, user.id, courseId);
  if (!plan?.stagedOutlineVersion) return null;
  const [run] = await db
    .select({
      status: generationRuns.status,
      error: generationRuns.error,
      currentStep: generationRuns.currentStep,
    })
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.courseId, courseId),
        eq(generationRuns.outlineVersion, plan.stagedOutlineVersion),
      ),
    )
    .orderBy(desc(generationRuns.updatedAt))
    .limit(1);
  return {
    plan: toPlanView(plan),
    failed: run?.status === "failed",
    error: run?.status === "failed" ? run.error : null,
    stage: run?.status === "failed" ? run.currentStep : null,
  };
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

export type UndoPlanResult =
  | { ok: true; revisionNumber: number }
  | { ok: false; reason: string; message: string };

export async function undoPlanRevisionAction(
  courseId: string,
  planId: string,
): Promise<UndoPlanResult> {
  const { user } = await requireLearner();
  const parsed = planSchema.safeParse({ courseId, planId });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "That undo does not fit the plan." };
  }
  const result = await undoPlanRevision(db, user.id, courseId, parsed.data.planId);
  if (!result.ok) return result;

  try {
    await start(repairFragmentsWorkflow, [
      courseId,
      result.outlineVersion,
      [...result.restoredLessons, ...result.removedLessons],
    ]);
  } catch {}
  return { ok: true, revisionNumber: result.revisionNumber };
}

export type PublishedPlanRow = {
  plan: PlanView;
  publishedRevisionNumber: number;
  canUndo: boolean;
  blockedReason?: string;
};

export async function listPublishedPlansAction(courseId: string): Promise<PublishedPlanRow[]> {
  const { user } = await requireLearner();
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ownerId, user.id)))
    .limit(1);
  if (!course) return [];
  const plans = await listPlansWithOperations(db, courseId);
  const published = plans
    .filter((p) => p.status === "published" && p.publishedRevisionNumber !== null)
    .sort((a, b) => b.publishedRevisionNumber! - a.publishedRevisionNumber!);

  return published.map((plan) => {
    const laterOverlap = published.some(
      (q) =>
        q.id !== plan.id &&
        q.publishedRevisionNumber! > plan.publishedRevisionNumber! &&
        ((q.touchedLessons ?? []).some((l) => (plan.touchedLessons ?? []).includes(l)) ||
          (q.touchedModules ?? []).some((m) => (plan.touchedModules ?? []).includes(m))),
    );
    return {
      plan: toPlanView(plan),
      publishedRevisionNumber: plan.publishedRevisionNumber!,
      canUndo: !laterOverlap,
      blockedReason: laterOverlap
        ? "A later change touched the same Lessons or Modules."
        : undefined,
    };
  });
}

// The current Course stays readable; publication swaps it atomically when the staged candidate passes review.
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
      { touchCourse: false },
    );
    return {
      ok: false,
      reason: "dispatch-failed",
      message: "The generation engine could not start this revision. Try again.",
    };
  }
}

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
      { touchCourse: false },
    );
    return {
      ok: false,
      reason: "dispatch-failed",
      message: "The generation engine could not start this retry. Try again.",
    };
  }
}

export type DiscardStagedRevisionResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "not-found" | "not-discardable"; message?: string };

export async function discardStagedRevisionAction(
  courseId: string,
  planId: string,
): Promise<DiscardStagedRevisionResult> {
  const { user } = await requireLearner();
  const parsed = planSchema.safeParse({ courseId, planId });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "That discard does not fit the plan." };
  }
  return discardStagedRevision(db, user.id, courseId, parsed.data.planId);
}
