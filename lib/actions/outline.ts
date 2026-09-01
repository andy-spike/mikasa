"use server";

/**
 * Outline checkpoint actions: structure changes (one op per call, from the
 * editor) and approval. Thin on purpose — authorize, validate the op
 * shape, delegate to `lib/db/outline`; the model call for reconciliation
 * is the one substantive piece, and it runs before any state changes so a
 * failed reconciliation leaves the Course exactly as it was.
 */
import { start } from "workflow/api";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireLearner } from "@/lib/session";
import { reconcileSpecification } from "@/lib/course/reconcile";
import { designModel } from "@/lib/model";
import type { OutlineOp } from "@/lib/course/structure";
import {
  applyOutlineChange,
  failGenerationRun,
  loadApprovalContext,
  openGenerationRun,
  saveReconciledSpec,
  specIsStale,
  type OutlineChangeResult,
  type OutlineRejection,
} from "@/lib/db/outline";
import { generateCourseWorkflow } from "@/workflows/course-generation";

const opSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("addModule"), title: z.string() }),
  z.object({ kind: z.literal("renameModule"), moduleId: z.string(), title: z.string() }),
  z.object({ kind: z.literal("removeModule"), moduleId: z.string() }),
  z.object({ kind: z.literal("moveModule"), moduleId: z.string(), toIndex: z.number().int() }),
  z.object({
    kind: z.literal("addLesson"),
    moduleId: z.string(),
    title: z.string(),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal("renameLesson"),
    lessonId: z.string(),
    title: z.string(),
    summary: z.string(),
  }),
  z.object({ kind: z.literal("removeLesson"), lessonId: z.string() }),
  z.object({
    kind: z.literal("moveLesson"),
    lessonId: z.string(),
    toModuleId: z.string(),
    toIndex: z.number().int(),
  }),
  z.object({
    kind: z.literal("splitLesson"),
    lessonId: z.string(),
    secondTitle: z.string(),
    secondSummary: z.string(),
  }),
  z.object({
    kind: z.literal("mergeLesson"),
    lessonId: z.string(),
    direction: z.enum(["next", "previous"]),
  }),
]);

export type OutlineActionResult = OutlineChangeResult;

/** Applies one editor operation as a new Outline version. */
export async function applyOutlineOpAction(
  courseId: string,
  baseVersion: number,
  op: unknown,
): Promise<OutlineActionResult> {
  const { user } = await requireLearner();
  const parsed = opSchema.safeParse(op);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: "That change does not fit the Outline.",
    };
  }
  return applyOutlineChange(db, user.id, courseId, baseVersion, [parsed.data as OutlineOp]);
}

export type ApprovalResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: OutlineRejection; message: string };

/**
 * Approves the Outline the Learner sees: reconciles a stale specification
 * against it, then opens the generation run pinned to that Outline
 * version. Re-approving an already-approved version does nothing (the run
 * exists); approving a stale version is a conflict.
 */
export async function approveOutlineAction(
  courseId: string,
  baseVersion: number,
): Promise<ApprovalResult> {
  const { user } = await requireLearner();

  const context = await loadApprovalContext(db, user.id, courseId);
  if (!context) {
    return { ok: false, reason: "not-found", message: "Course not found." };
  }
  const { course, outline, specRow } = context;

  if (
    course.status !== "awaiting-outline-approval" &&
    course.status !== "generating" &&
    course.status !== "reviewing" &&
    course.status !== "ready"
  ) {
    return {
      ok: false,
      reason: "not-approvable",
      message: "This Course is not waiting for Outline approval.",
    };
  }

  if (outline.version !== baseVersion) {
    return {
      ok: false,
      reason: "conflict",
      message:
        "The Outline changed while you were reviewing it. Reload and approve the current shape.",
    };
  }

  // A re-approval of the version a run is already pinned to is a no-op;
  // this also covers double clicks while the first approval is in flight.
  if (course.status !== "awaiting-outline-approval") {
    const opened = await openGenerationRun(db, user.id, courseId, baseVersion);
    if (opened.ok) return { ok: true, duplicate: true };
    return opened;
  }

  // Reconcile BEFORE anything changes: a failed model call leaves the
  // Course awaiting approval, editable, with the old spec intact.
  if (specRow && specIsStale(specRow, outline.version)) {
    try {
      const reconciled = await reconcileSpecification(
        designModel(),
        outline.data,
        specRow.spec,
      );
      await saveReconciledSpec(db, courseId, reconciled, outline.version);
    } catch (error) {
      return {
        ok: false,
        reason: "invalid",
        message:
          error instanceof Error && error.message
            ? `The Course specification could not be reconciled: ${error.message}`
            : "The Course specification could not be reconciled. Try again.",
      };
    }
  }

  const opened = await openGenerationRun(db, user.id, courseId, baseVersion);
  if (!opened.ok) return opened;
  if (opened.duplicate) return { ok: true, duplicate: true };

  try {
    await start(generateCourseWorkflow, [courseId, opened.run.id, outline.version]);
    return { ok: true, duplicate: false };
  } catch {
    // Mirror design: if the engine cannot take the run, the Course fails
    // visibly and stays retryable instead of pretending to generate.
    await failGenerationRun(
      db,
      courseId,
      opened.run.id,
      "The generation engine could not start this run.",
    );
    return {
      ok: false,
      reason: "not-approvable",
      message: "The generation engine could not start this run. Try again.",
    };
  }
}
