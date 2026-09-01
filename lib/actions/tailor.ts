"use server";

/**
 * Tailor review actions (ticket #12): accepting or discarding one
 * operation of a Change plan under review. These actions change the
 * review, never the Course — the Outline, Lessons, and specification are
 * untouched until the accepted operations are applied (#13/#14).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner } from "@/lib/session";
import {
  applyPlanToOutline,
  findProposedPlan,
  setOperationStatus,
} from "@/lib/db/tailor";
import type { ChangePlanRow } from "@/lib/db/tailor";
import type { PlanView } from "@/components/workspace/panel";
import { opDetail, opEntry, opVerb } from "@/lib/course/change-plan";

const statusSchema = z.object({
  planId: z.string().uuid(),
  operationId: z.string().uuid(),
  status: z.enum(["accepted", "discarded", "proposed"]),
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

const applySchema = z.object({
  courseId: z.string().uuid(),
  planId: z.string().uuid(),
});

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
  const parsed = applySchema.safeParse({ courseId, planId });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "That apply does not fit the plan." };
  }
  return applyPlanToOutline(db, user.id, courseId, parsed.data.planId);
}
