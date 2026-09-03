"use server";

/**
 * Tailor actions (tickets #12–#14): reviewing a plan's operations,
 * applying a plan to a pre-generation Outline, and staging a published
 * Course's plan as a new revision. The review changes the plan, never
 * the Course; application and staging are the only doors that do.
 */
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
export async function findProposedPlanAction(courseId: string): Promise<PlanView | null> {
  const { user } = await requireLearner();
  const plan = await findProposedPlan(db, user.id, courseId);
  return plan ? toPlanView(plan) : null;
}

export type StagedPlanView = {
  plan: PlanView;
  failed: boolean;
  error: string | null;
  /** The stage the failed run was in, in Learner words ("review"). */
  stage: string | null;
};

/** The active staged Course revision, including a failure the Learner can retry. */
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

export type UndoPlanResult =
  | { ok: true; revisionNumber: number }
  | { ok: false; reason: string; message: string };

/**
 * Undoes a published plan (#15): the touched identities go back to what
 * the base revision had — shape, content, and Completion — and the Course
 * moves to a new revision carrying that restored state. Only possible
 * while no later published change has touched the same identities.
 */
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

  /* The Tutor's search index follows the undo (bug 9): restored Lessons
     re-embed from their restored content, removed Lessons' fragments are
     deleted. A dispatch failure changes nothing the undo changed — the
     reading page's stale-search notice still catches the gap. */
  try {
    await start(repairFragmentsWorkflow, [
      courseId,
      result.outlineVersion,
      [...result.restoredLessons, ...result.removedLessons],
    ]);
  } catch {
    /* The undo itself landed; only the re-embed is missing. */
  }
  return { ok: true, revisionNumber: result.revisionNumber };
}

export type PublishedPlanRow = {
  plan: PlanView;
  publishedRevisionNumber: number;
  canUndo: boolean;
  blockedReason?: string;
};

/**
 * The Course's published plans, newest first, each with its undo
 * availability (#15) — the pane's Published changes section.
 */
export async function listPublishedPlansAction(courseId: string): Promise<PublishedPlanRow[]> {
  const { user } = await requireLearner();
  /* The plans belong to the Course, and the Course to the caller: an
     unknown or foreign Course reads as no published changes. */
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
      { touchCourse: false },
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
      { touchCourse: false },
    );
    return {
      ok: false,
      reason: "dispatch-failed",
      message: "The generation engine could not start this retry. Try again.",
    };
  }
}

/**
 * Gives up on a staged revision that keeps failing (bug 10): the plan is
 * superseded and the Tailor can propose a fresh one. The published
 * Course and the current revision are untouched.
 */
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
