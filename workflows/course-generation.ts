// Step args cross process boundaries as JSON, so providers resolve inside each step.
import {
  ensureValidSpec,
  resolveReviewResumePoint,
  stepEmbedFragments,
  stepFailGeneration,
  stepGenerationCancelled,
  stepMarkStep,
  stepPublish,
} from "./course-steps";
import { reviewCourseCandidate, writeCourseLessons } from "./course-sequence";

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

    const written = await writeCourseLessons(activeContext, runId, true);
    if (!written.ok) return written;

    if (await stepGenerationCancelled(runId)) {
      return { ok: false as const, reason: "cancelled" };
    }
    const review = await reviewCourseCandidate(activeContext, runId, { kind: "initial" });
    if (review.state === "published") {
      await stepEmbedFragments(courseId, outlineVersion, runId);
      return { ok: true as const, revisionNumber: review.revisionNumber };
    }
    if (review.state !== "ready") return { ok: false as const, reason: review.state };

    if (await stepGenerationCancelled(runId)) {
      return { ok: false as const, reason: "cancelled" };
    }
    await stepMarkStep(runId, "publish");
    const published = await stepPublish(courseId, outlineVersion, review.reviewRunId, runId);
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
