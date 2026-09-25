// Step args cross process boundaries as JSON, so providers resolve inside each step.
import type { GenerationContext } from "@/lib/db/lessons";
import {
  ensureValidSpec,
  stepEmbedFragments,
  stepFailGeneration,
  stepGenerationCancelled,
  stepLoadContext,
  stepMarkStep,
  stepPublish,
  stepRecordExpandedTouched,
} from "./course-steps";
import { reviewCourseCandidate, writeCourseLessons } from "./course-sequence";
import { setModelStepRetryLimit, withModelFailurePolicy } from "./model-failure-policy";

async function stepReconcileSpec(
  planId: string,
  context: GenerationContext,
  runId: string,
): Promise<GenerationContext> {
  "use step";
  const { db } = await import("@/lib/db");
  const { generationModel } = await import("@/lib/model");
  const { reconcileSpecification, specNeedsReconciliation } =
    await import("@/lib/course/reconcile");
  const { planContentAdjustments, planHasStructuralChanges } = await import("@/lib/db/tailor");
  const { saveReconciledSpec } = await import("@/lib/db/outline");

  const adjustments = await planContentAdjustments(db, planId);
  const { generationRuns } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const [run] = await db
    .select({ currentStep: generationRuns.currentStep })
    .from(generationRuns)
    .where(eq(generationRuns.id, runId))
    .limit(1);
  // Past "queued" a previous attempt already reconciled; re-running would rewrite the spec under written Lessons.
  if (run && run.currentStep !== "queued") return context;
  if (
    !(await planHasStructuralChanges(db, planId)) &&
    !specNeedsReconciliation(context.spec, context.outline.data, adjustments)
  ) {
    return context;
  }

  const reconciled = await withModelFailurePolicy(() =>
    reconcileSpecification(generationModel(), context.outline.data, context.spec, adjustments),
  );
  await saveReconciledSpec(db, context.course.id, reconciled, context.outline.version);
  return { ...context, spec: reconciled };
}

setModelStepRetryLimit(stepReconcileSpec);

// Stale guard: a candidate must never replace a newer revision.
async function stepCheckStillCurrent(
  courseId: string,
  baseRevisionNumber: number,
): Promise<{ ok: boolean; current?: number }> {
  "use step";
  const { currentRevision } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  const revision = await currentRevision(db, courseId);
  if (!revision || revision.revisionNumber !== baseRevisionNumber) {
    return { ok: false, current: revision?.revisionNumber };
  }
  return { ok: true };
}

async function stepMarkPlan(
  planId: string,
  status: "published" | "failed",
  revisionNumber?: number,
): Promise<void> {
  "use step";
  if (status === "published") {
    const { markRevisionPublished } = await import("@/lib/db/tailor");
    const { db } = await import("@/lib/db");
    await markRevisionPublished(db, planId, revisionNumber!);
    return;
  }
  const { db } = await import("@/lib/db");
  const { changePlans } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db
    .update(changePlans)
    .set({ status, updatedAt: new Date() })
    .where(eq(changePlans.id, planId));
}

export async function stageRevisionWorkflow(
  courseId: string,
  planId: string,
  runId: string,
  outlineVersion: number,
  baseRevisionNumber: number,
  regenerateLessonRefs: string[],
  embedLessonRefs: string[],
) {
  "use workflow";

  const context = await stepLoadContext(courseId, outlineVersion);
  if (!context) {
    await stepFailGeneration(
      courseId,
      runId,
      "The staged revision's Course no longer exists.",
      false,
    );
    await stepMarkPlan(planId, "failed");
    return { ok: false as const, reason: "course-not-found" };
  }

  try {
    await stepReconcileSpec(planId, context, runId);
    // Stale specs reconcile once at preparation; an invalid spec gets one
    // conditional repair before any Lesson work starts.
    const valid = await ensureValidSpec(courseId, outlineVersion);
    if (!valid.ok) {
      const message =
        valid.reason === "course-not-found"
          ? "The staged revision's Course no longer exists."
          : valid.reason === "repair-failed"
            ? valid.error
            : `The staged specification is invalid: ${valid.errors.join(" ")}`;
      await stepFailGeneration(courseId, runId, message, false);
      await stepMarkPlan(planId, "failed");
      return { ok: false as const, reason: "invalid-spec" };
    }
    const prepared = valid.context;

    const written = await writeCourseLessons(prepared, runId, false);
    if (!written.ok) return written;

    const review = await reviewCourseCandidate(prepared, runId, {
      kind: "revision",
      regenerateLessonRefs,
    });
    if (review.state === "published") {
      await stepEmbedFragments(courseId, outlineVersion, runId, embedLessonRefs);
      await stepMarkPlan(planId, "published", review.revisionNumber);
      return { ok: true as const, revisionNumber: review.revisionNumber };
    }
    if (review.state !== "ready") return { ok: false as const, reason: review.state };
    const regenerateSet = new Set(regenerateLessonRefs);

    // Corrections that reached beyond the plan expand the touched set and
    // the embedding set; the base Completion snapshot stays for Undo.
    const extra = review.correctedRefs.filter((ref) => !regenerateSet.has(ref));
    const expandedEmbed = [...new Set([...embedLessonRefs, ...review.correctedRefs])];
    if (extra.length > 0) {
      await stepRecordExpandedTouched(planId, extra);
    }

    const stillCurrent = await stepCheckStillCurrent(courseId, baseRevisionNumber);
    if (!stillCurrent.ok) {
      await stepFailGeneration(
        courseId,
        runId,
        `The Course moved to revision ${stillCurrent.current} while this revision was being prepared. The staged changes were discarded.`,
        false,
      );
      await stepMarkPlan(planId, "failed");
      return { ok: false as const, reason: "stale-revision" };
    }

    await stepMarkStep(runId, "publish");
    const published = await stepPublish(
      courseId,
      outlineVersion,
      review.reviewRunId,
      runId,
      baseRevisionNumber,
    );
    if (!published.ok) {
      // Review stays succeeded so a retry resumes at publication.
      await stepFailGeneration(
        courseId,
        runId,
        `Publication failed: ${published.reason ?? "The revision could not be published."}`,
        false,
      );
      return { ok: false as const, reason: "publish-failed" };
    }

    await stepEmbedFragments(courseId, outlineVersion, runId, expandedEmbed);
    await stepMarkPlan(planId, "published", published.revisionNumber);
    return { ok: true as const, revisionNumber: published.revisionNumber };
  } catch (error) {
    if (await stepGenerationCancelled(runId)) {
      return { ok: false as const, reason: "cancelled" };
    }
    await stepFailGeneration(
      courseId,
      runId,
      error instanceof Error && error.message ? error.message : "The revision failed.",
      false,
    );
    return { ok: false as const, reason: "revision-failed" };
  }
}
