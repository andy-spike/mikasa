"use server";

import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { z } from "zod";
import { db } from "@/lib/db";
import { generationRuns } from "@/lib/db/schema";
import { requireLearner } from "@/lib/session";
import { reconcileSpecification } from "@/lib/course/reconcile";
import { validateSpecification } from "@/lib/course/specification";
import { designModel } from "@/lib/model";
import { listCourseSources } from "@/lib/db/design";
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
import { activeContentAdjustments } from "@/lib/db/tailor";
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
  return applyOutlineChange(db, user.id, courseId, baseVersion, [parsed.data]);
}

export type ApprovalResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: OutlineRejection; message: string };

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

  if (!["awaiting-outline-approval", "generating", "reviewing", "ready"].includes(course.status)) {
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

  // A re-approval of the version a run is already pinned to is a no-op (covers double clicks in flight).
  if (course.status !== "awaiting-outline-approval") {
    const opened = await openGenerationRun(db, user.id, courseId, baseVersion);
    return opened.ok ? { ok: true, duplicate: true } : opened;
  }

  // Reconcile stale specifications once at approval. The extra repair call
  // below is conditional on validation failure.
  const adjustments = await activeContentAdjustments(db, courseId, outline.data);
  let specForValidation = specRow?.spec;
  if (specRow && specIsStale(specRow, outline.version)) {
    try {
      const reconciled = await reconcileSpecification(
        designModel(),
        outline.data,
        specRow.spec,
        adjustments,
      );
      await saveReconciledSpec(db, courseId, reconciled, outline.version);
      specForValidation = reconciled;
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

  // Validate reading-order consistency and Source references before starting
  // work. On failure, attempt one reconciliation with the validation errors.
  if (specForValidation) {
    const stored = await listCourseSources(db, courseId);
    const available = new Set(stored.map((s) => s.ref));
    try {
      validateSpecification(specForValidation, outline.data, available);
    } catch (first) {
      const firstMessage = first instanceof Error ? first.message : "The specification is invalid.";
      try {
        const repaired = await reconcileSpecification(
          designModel(),
          outline.data,
          specForValidation,
          adjustments,
          [firstMessage],
        );
        await saveReconciledSpec(db, courseId, repaired, outline.version);
        validateSpecification(repaired, outline.data, available);
        specForValidation = repaired;
      } catch (repairError) {
        const message =
          repairError instanceof Error && repairError.message ? repairError.message : firstMessage;
        return {
          ok: false,
          reason: "invalid",
          message: `The Course specification is invalid and could not be repaired: ${message}`,
        };
      }
    }
  }

  const opened = await openGenerationRun(db, user.id, courseId, baseVersion);
  if (!opened.ok) return opened;
  if (opened.duplicate) return { ok: true, duplicate: true };

  try {
    const started = await start(generateCourseWorkflow, [courseId, opened.run.id, outline.version]);
    await db
      .update(generationRuns)
      .set({ workflowRunId: started.runId })
      .where(eq(generationRuns.id, opened.run.id));
    return { ok: true, duplicate: false };
  } catch {
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
