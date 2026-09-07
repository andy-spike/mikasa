// Step args cross process boundaries as JSON, so providers resolve inside each step.
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
  stepGenerationCancelled,
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

async function stepReviewResumePoint(
  courseId: string,
  outlineVersion: number,
): Promise<
  | { action: "review" }
  | { action: "publish"; reviewRunId: string }
  | { action: "done"; revisionNumber: number }
> {
  "use step";
  const { db } = await import("@/lib/db");
  const { latestReviewRun, currentRevision } = await import("@/lib/db/review");
  const { reviewFindings } = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");

  const revision = await currentRevision(db, courseId);
  if (revision && revision.outlineVersion === outlineVersion) {
    return { action: "done", revisionNumber: revision.revisionNumber };
  }

  const review = await latestReviewRun(db, courseId);
  if (review && review.outlineVersion === outlineVersion && review.status === "succeeded") {
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

export async function generateCourseWorkflow(
  courseId: string,
  runId: string,
  outlineVersion: number,
) {
  "use workflow";

  const context = await stepLoadContext(courseId, outlineVersion);
  if (!context) {
    await stepFailGeneration(courseId, runId, "The Course to generate no longer exists.", true);
    return { ok: false as const, reason: "course-not-found" };
  }

  try {
    const order = await stepOrder(context);
    await stepMarkStep(runId, "lessons");

    // Outline titles and summaries are known up front, so every Lesson
    // prompt carries the same static framing and waves stay independent.
    const priorLessons = order.map((l) => ({ title: l.title, summary: l.summary }));
    const position = new Map(order.map((l, i) => [l.id, i]));
    const already = new Set(context.written);
    const pending = order.filter((l) => !already.has(l.id));

    const sourcePlans = await stepPlanSources(
      context,
      pending.map((l) => ({ id: l.id, title: l.title, summary: l.summary })),
    );
    const fetched = await Promise.all(
      sourcePlans.map((plan) => stepFetchSource(context.course.id, plan.query)),
    );
    const sources = [...context.sources, ...fetched.filter((f) => f !== null)];

    for (let w = 0; w < pending.length; w += LESSON_WAVE_SIZE) {
      if (await stepGenerationCancelled(runId)) {
        return { ok: false as const, reason: "cancelled" };
      }
      const wave = pending.slice(w, w + LESSON_WAVE_SIZE);
      await Promise.all(
        wave.map((lesson) =>
          stepGenerateLesson(
            context,
            runId,
            lesson,
            order[position.get(lesson.id)! + 1] ?? null,
            priorLessons,
            sources,
          ),
        ),
      );
    }

    if (await stepGenerationCancelled(runId)) {
      return { ok: false as const, reason: "cancelled" };
    }
    const finished = await stepFinish(courseId, outlineVersion, runId, true);
    if (!finished.ok) {
      return {
        ok: false as const,
        reason: "incomplete-candidate",
        missing: finished.missing,
      };
    }

    if (await stepGenerationCancelled(runId)) {
      return { ok: false as const, reason: "cancelled" };
    }
    const resume = await stepReviewResumePoint(courseId, outlineVersion);
    if (resume.action === "done") {
      return { ok: true as const, revisionNumber: resume.revisionNumber };
    }

    let reviewRunId: string;
    let findings: ReviewFindingPayload[];
    if (resume.action === "publish") {
      reviewRunId = resume.reviewRunId;
      findings = [];
    } else {
      await stepMarkStep(runId, "review");
      reviewRunId = await stepOpenReviewRun(courseId, outlineVersion, true);
      findings = await runReviewRound(courseId, outlineVersion, reviewRunId, 0);
    }

    let round = 0;
    while (findings.length > 0 && round < MAX_CORRECTION_ROUNDS) {
      round += 1;
      if (await stepGenerationCancelled(runId)) {
        return { ok: false as const, reason: "cancelled" };
      }
      await stepMarkStep(runId, `corrections:${round}`);

      const byLesson = groupFindingsByLesson(findings);
      await Promise.all(
        [...byLesson].map(([lessonRef, lessonFindings]) =>
          stepCorrectLesson(courseId, outlineVersion, runId, lessonRef, lessonFindings),
        ),
      );
      await stepMarkCorrected(reviewRunId, round - 1);

      findings = await runReviewRound(courseId, outlineVersion, reviewRunId, round);
    }

    if (findings.length > 0) {
      const message = `The review still finds ${findings.length} problem(s) after ${MAX_CORRECTION_ROUNDS} correction rounds. The Course was not published.`;
      await stepFailReview(courseId, reviewRunId, message, true);
      return { ok: false as const, reason: "review-failed" };
    }

    await stepFinishReviewRun(reviewRunId);

    if (await stepGenerationCancelled(runId)) {
      return { ok: false as const, reason: "cancelled" };
    }
    await stepMarkStep(runId, "publish");
    const published = await stepPublish(courseId, outlineVersion, reviewRunId);
    if (!published.ok) {
      // Review stays succeeded so a retry resumes at publication.
      await stepFailGeneration(courseId, runId, published.reason ?? "Publication failed.", true);
      return { ok: false as const, reason: "publish-failed" };
    }
    await stepEmbedFragments(courseId, outlineVersion, runId);
    return { ok: true as const, revisionNumber: published.revisionNumber };
  } catch (error) {
    if (await stepGenerationCancelled(runId)) {
      return { ok: false as const, reason: "cancelled" };
    }
    await stepFailGeneration(
      courseId,
      runId,
      error instanceof Error && error.message ? error.message : "Course generation failed.",
      true,
    );
    return { ok: false as const, reason: "generation-failed" };
  }
}
