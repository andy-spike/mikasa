// Step args cross process boundaries as JSON, so providers resolve inside each step.
import type { GenerationContext } from "@/lib/db/lessons";
import { LESSON_WAVE_SIZE } from "@/lib/course/generate";
import { MAX_CORRECTION_ROUNDS } from "@/lib/course/review";
import {
  groupFindingsByLesson,
  runReviewRound,
  stepEmbedFragments,
  stepFailGeneration,
  stepFetchSource,
  stepFinish,
  stepFinishReviewRun,
  stepFailReview,
  stepGenerateLesson,
  stepLoadContext,
  stepMarkStep,
  stepMarkCorrected,
  stepCorrectLesson,
  stepOpenReviewRun,
  stepOrder,
  stepPlanSources,
  stepPublish,
  type ReviewFindingPayload,
} from "./course-steps";

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

  const reconciled = await reconcileSpecification(
    generationModel(),
    context.outline.data,
    context.spec,
    adjustments,
  );
  await saveReconciledSpec(db, context.course.id, reconciled, context.outline.version);
  return { ...context, spec: reconciled };
}

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

async function stepReviewResumePoint(
  courseId: string,
  outlineVersion: number,
): Promise<
  | { action: "done"; revisionNumber: number }
  | { action: "publish"; reviewRunId: string }
  | { action: "review" }
> {
  "use step";
  const { db } = await import("@/lib/db");
  const { revisions, reviewRuns, reviewFindings } = await import("@/lib/db/schema");
  const { and, desc, eq } = await import("drizzle-orm");

  // A crash between publication and the plan mark still counts as done.
  const [revision] = await db
    .select({ revisionNumber: revisions.revisionNumber })
    .from(revisions)
    .where(and(eq(revisions.courseId, courseId), eq(revisions.outlineVersion, outlineVersion)))
    .limit(1);
  if (revision) return { action: "done", revisionNumber: revision.revisionNumber };

  const [review] = await db
    .select()
    .from(reviewRuns)
    .where(and(eq(reviewRuns.courseId, courseId), eq(reviewRuns.outlineVersion, outlineVersion)))
    .orderBy(desc(reviewRuns.startedAt))
    .limit(1);
  if (review && review.status === "succeeded") {
    const open = await db
      .select({ id: reviewFindings.id })
      .from(reviewFindings)
      .where(and(eq(reviewFindings.reviewRunId, review.id), eq(reviewFindings.status, "open")))
      .limit(1);
    if (open.length === 0) {
      return { action: "publish", reviewRunId: review.id };
    }
  }
  return { action: "review" };
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
    await stepFailGeneration(courseId, runId, "The staged revision's Course no longer exists.", false);
    await stepMarkPlan(planId, "failed");
    return { ok: false as const, reason: "course-not-found" };
  }

  try {
    const prepared = await stepReconcileSpec(planId, context, runId);
    const order = await stepOrder(prepared);
    await stepMarkStep(runId, "lessons");

    const priorLessons = order.map((l) => ({ title: l.title, summary: l.summary }));
    const position = new Map(order.map((l, i) => [l.id, i]));
    const already = new Set(prepared.written);
    const pending = order.filter((l) => !already.has(l.id));

    const sourcePlans = await stepPlanSources(
      prepared,
      pending.map((l) => ({ id: l.id, title: l.title, summary: l.summary })),
    );
    const fetched = await Promise.all(
      sourcePlans.map((plan) => stepFetchSource(prepared.course.id, plan.query)),
    );
    const sources = [...prepared.sources, ...fetched.filter((f) => f !== null)];

    for (let w = 0; w < pending.length; w += LESSON_WAVE_SIZE) {
      const wave = pending.slice(w, w + LESSON_WAVE_SIZE);
      await Promise.all(
        wave.map((lesson) =>
          stepGenerateLesson(
            prepared,
            runId,
            lesson,
            order[position.get(lesson.id)! + 1] ?? null,
            priorLessons,
            sources,
          ),
        ),
      );
    }

    const finished = await stepFinish(courseId, outlineVersion, runId, false);
    if (!finished.ok) {
      return {
        ok: false as const,
        reason: "incomplete-candidate",
        missing: finished.missing,
      };
    }

    const resume = await stepReviewResumePoint(courseId, outlineVersion);
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
      findings = await runReviewRound(
        courseId,
        outlineVersion,
        reviewRunId,
        0,
        regenerateLessonRefs,
      );
    }

    while (findings.length > 0 && round < MAX_CORRECTION_ROUNDS) {
      round += 1;
      await stepMarkStep(runId, `corrections:${round}`);

      const byLesson = groupFindingsByLesson(findings);
      await Promise.all(
        [...byLesson].map(([lessonRef, lessonFindings]) =>
          stepCorrectLesson(courseId, outlineVersion, runId, lessonRef, lessonFindings),
        ),
      );
      await stepMarkCorrected(reviewRunId, round - 1);

      findings = await runReviewRound(
        courseId,
        outlineVersion,
        reviewRunId,
        round,
        regenerateLessonRefs,
      );
    }

    if (findings.length > 0) {
      const message = `The review still finds ${findings.length} problem(s) after ${MAX_CORRECTION_ROUNDS} correction rounds. The revision was not published; the current Course is unchanged.`;
      await stepFailReview(courseId, reviewRunId, message, false);
      return { ok: false as const, reason: "review-failed" };
    }

    await stepFinishReviewRun(reviewRunId);

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
    const published = await stepPublish(courseId, outlineVersion, reviewRunId);
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

    await stepEmbedFragments(courseId, outlineVersion, runId, embedLessonRefs);
    await stepMarkPlan(planId, "published", published.revisionNumber);
    return { ok: true as const, revisionNumber: published.revisionNumber };
  } catch (error) {
    await stepFailGeneration(
      courseId,
      runId,
      error instanceof Error && error.message ? error.message : "The revision failed.",
      false,
    );
    return { ok: false as const, reason: "revision-failed" };
  }
}
