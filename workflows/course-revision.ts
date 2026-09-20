// Step args cross process boundaries as JSON, so providers resolve inside each step.
import type { GenerationContext } from "@/lib/db/lessons";
import { MAX_CORRECTION_ROUNDS, dedupeCorrectionQueries } from "@/lib/course/review-policy";
import {
  ensureValidSpec,
  groupFindingsByLesson,
  resolveReviewResumePoint,
  runReviewRound,
  stepEmbedFragments,
  stepFailGeneration,
  stepFetchCorrectionSources,
  stepFinish,
  stepFinishReviewRun,
  stepFailReview,
  stepGenerateLesson,
  stepGenerationCancelled,
  stepLoadContext,
  stepMarkStep,
  stepMarkCorrected,
  stepCorrectLesson,
  stepOpenReviewRun,
  stepOrder,
  stepPublish,
  stepRecordExpandedTouched,
  type ReviewFindingPayload,
} from "./course-steps";
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

    const order = await stepOrder(prepared);
    await stepMarkStep(runId, "lessons");

    const already = new Set(prepared.written);
    const pending = order.filter((l) => !already.has(l.id));

    // One Lesson at a time, in reading order (ADR 0009), so rewritten
    // Lessons continue from the Lessons that keep their prose.
    for (const lesson of pending) {
      if (await stepGenerationCancelled(runId)) {
        return { ok: false as const, reason: "cancelled" };
      }
      await stepGenerateLesson(prepared, runId, lesson.id);
    }

    if (await stepGenerationCancelled(runId)) {
      return { ok: false as const, reason: "cancelled" };
    }

    const finished = await stepFinish(courseId, outlineVersion, runId, false);
    if (!finished.ok) {
      return {
        ok: false as const,
        reason: "incomplete-candidate",
        missing: finished.missing,
      };
    }

    const resume = await resolveReviewResumePoint(courseId, outlineVersion);
    if (resume.action === "done") {
      await stepEmbedFragments(courseId, outlineVersion, runId, embedLessonRefs);
      await stepMarkPlan(planId, "published", resume.revisionNumber);
      return { ok: true as const, revisionNumber: resume.revisionNumber };
    }

    let round = 0;
    let reviewRunId: string;
    let findings: ReviewFindingPayload[];
    if (resume.action === "publish") {
      reviewRunId = resume.reviewRunId;
      findings = [];
    } else {
      await stepMarkStep(runId, "review");
      reviewRunId = await stepOpenReviewRun(courseId, outlineVersion, false);
      // Staged review sees the complete Course, not just regenerated Lessons.
      findings = await runReviewRound(courseId, outlineVersion, reviewRunId, 0, runId);
    }

    const regenerateSet = new Set(regenerateLessonRefs);
    const correctedRefs = new Set<string>();

    while (findings.length > 0 && round < MAX_CORRECTION_ROUNDS) {
      round += 1;
      if (await stepGenerationCancelled(runId)) {
        return { ok: false as const, reason: "cancelled" };
      }
      await stepMarkStep(runId, `corrections:${round}`);

      const queries = dedupeCorrectionQueries(findings);
      if (queries.length > 0) {
        await stepFetchCorrectionSources(courseId, prepared.course.grounding, queries);
      }

      const byLesson = groupFindingsByLesson(findings);
      const entries = [...byLesson];
      for (const [ref] of entries) correctedRefs.add(ref);
      // One Lesson at a time: each correction step re-reads the candidate,
      // so it sees what the previous corrections just changed and agrees
      // with them. Parallel corrections of one shared example diverge.
      for (const [lessonRef, lessonFindings] of entries) {
        if (await stepGenerationCancelled(runId)) {
          return { ok: false as const, reason: "cancelled" };
        }
        // Related unchanged Lessons get prose, worked-example, prompt, and
        // bridge fixes only; their Exercises stay exactly as published.
        const preserve = !regenerateSet.has(lessonRef);
        await stepCorrectLesson(courseId, outlineVersion, runId, lessonRef, lessonFindings, {
          preserveExercise: preserve,
        });
      }
      await stepMarkCorrected(reviewRunId, round - 1);

      findings = await runReviewRound(courseId, outlineVersion, reviewRunId, round, runId);
    }

    if (findings.length > 0) {
      const message = `The review still finds ${findings.length} problem(s) after ${MAX_CORRECTION_ROUNDS} correction rounds. The revision was not published; the current Course is unchanged.`;
      await stepFailReview(courseId, reviewRunId, message, false);
      return { ok: false as const, reason: "review-failed" };
    }

    await stepFinishReviewRun(reviewRunId);

    // Corrections that reached beyond the plan expand the touched set and
    // the embedding set; the base Completion snapshot stays for Undo.
    const extra = [...correctedRefs].filter((r) => !regenerateSet.has(r));
    const expandedEmbed = [...new Set([...embedLessonRefs, ...correctedRefs])];
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
      reviewRunId,
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
