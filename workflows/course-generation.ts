// Step args cross process boundaries as JSON, so providers resolve inside each step.
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
  stepMarkStep,
  stepMarkCorrected,
  stepCorrectLesson,
  stepOpenReviewRun,
  stepOrder,
  stepPublish,
  type ReviewFindingPayload,
} from "./course-steps";

export async function generateCourseWorkflow(
  courseId: string,
  runId: string,
  outlineVersion: number,
) {
  "use workflow";

  // If already published, resume only unfinished embedding or bookkeeping.
  const already = await resolveReviewResumePoint(courseId, outlineVersion);
  if (already.action === "done") {
    await stepEmbedFragments(courseId, outlineVersion, runId);
    return { ok: true as const, revisionNumber: already.revisionNumber };
  }

  try {
    // Validate the specification against reading order and stored Sources.
    // One conditional repair on failure; otherwise record an actionable error.
    const valid = await ensureValidSpec(courseId, outlineVersion);
    if (!valid.ok) {
      if (valid.reason === "course-not-found") {
        await stepFailGeneration(courseId, runId, "The Course to generate no longer exists.", true);
        return { ok: false as const, reason: "course-not-found" };
      }
      if (valid.reason === "repair-failed") {
        await stepFailGeneration(courseId, runId, valid.error, true);
        return { ok: false as const, reason: "invalid-spec" };
      }
      await stepFailGeneration(
        courseId,
        runId,
        `The Course specification is invalid: ${valid.errors.join(" ")}`,
        true,
      );
      return { ok: false as const, reason: "invalid-spec" };
    }
    const activeContext = valid.context;

    const order = await stepOrder(activeContext);
    await stepMarkStep(runId, "lessons");

    // One Lesson at a time, in reading order (ADR 0009): each Lesson sees the
    // actual prose of the Lessons before it, so shared scaffolding is
    // established once and extended instead of reinvented per Lesson.
    const alreadyWritten = new Set(activeContext.written);
    const pending = order.filter((l) => !alreadyWritten.has(l.id));

    for (const lesson of pending) {
      if (await stepGenerationCancelled(runId)) {
        return { ok: false as const, reason: "cancelled" };
      }
      await stepGenerateLesson(activeContext, runId, lesson.id);
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
    const resume = await resolveReviewResumePoint(courseId, outlineVersion);
    if (resume.action === "done") {
      await stepEmbedFragments(courseId, outlineVersion, runId);
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
      findings = await runReviewRound(courseId, outlineVersion, reviewRunId, 0, runId);
    }

    let round = 0;
    while (findings.length > 0 && round < MAX_CORRECTION_ROUNDS) {
      round += 1;
      if (await stepGenerationCancelled(runId)) {
        return { ok: false as const, reason: "cancelled" };
      }
      await stepMarkStep(runId, `corrections:${round}`);

      // Correction searches obey Grounding and the query cap: deduped
      // factual sourceQuery values, at most three, in stable finding order.
      const queries = dedupeCorrectionQueries(findings);
      if (queries.length > 0) {
        await stepFetchCorrectionSources(courseId, activeContext.course.grounding, queries);
      }

      const byLesson = groupFindingsByLesson(findings);
      // One Lesson at a time: each correction step re-reads the candidate,
      // so it sees what the previous corrections just changed and agrees
      // with them. Parallel corrections of one shared example diverge.
      for (const [lessonRef, lessonFindings] of byLesson) {
        if (await stepGenerationCancelled(runId)) {
          return { ok: false as const, reason: "cancelled" };
        }
        await stepCorrectLesson(courseId, outlineVersion, runId, lessonRef, lessonFindings);
      }
      // Findings count as corrected only after their writes succeeded.
      await stepMarkCorrected(reviewRunId, round - 1);

      findings = await runReviewRound(courseId, outlineVersion, reviewRunId, round, runId);
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
    const published = await stepPublish(courseId, outlineVersion, reviewRunId, runId);
    if (!published.ok) {
      // Review stays succeeded so a retry resumes at publication.
      await stepFailGeneration(courseId, runId, published.reason ?? "Publication failed.", true);
      return { ok: false as const, reason: "publish-failed" };
    }
    // Embedding failure stays repairable and does not fail publication.
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
