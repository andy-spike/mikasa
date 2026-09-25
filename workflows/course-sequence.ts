import type { GenerationContext } from "@/lib/db/lessons";
import { MAX_CORRECTION_ROUNDS, dedupeCorrectionQueries } from "@/lib/course/review-policy";
import {
  groupFindingsByLesson,
  resolveReviewResumePoint,
  runReviewRound,
  stepCorrectLesson,
  stepFailReview,
  stepFetchCorrectionSources,
  stepFinish,
  stepFinishReviewRun,
  stepGenerateLesson,
  stepGenerationCancelled,
  stepMarkCorrected,
  stepMarkStep,
  stepOpenReviewRun,
  stepOrder,
  type ReviewFindingPayload,
} from "./course-steps";

export async function writeCourseLessons(
  context: GenerationContext,
  runId: string,
  promoteCourse: boolean,
): Promise<
  | { ok: true }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "incomplete-candidate"; missing: number }
> {
  const order = await stepOrder(context);
  await stepMarkStep(runId, "lessons");
  const written = new Set(context.written);
  for (const lesson of order) {
    if (written.has(lesson.id)) continue;
    if (await stepGenerationCancelled(runId)) return { ok: false, reason: "cancelled" };
    await stepGenerateLesson(context, runId, lesson.id);
  }
  if (await stepGenerationCancelled(runId)) return { ok: false, reason: "cancelled" };
  const finished = await stepFinish(
    context.course.id,
    context.outline.version,
    runId,
    promoteCourse,
  );
  return finished.ok
    ? { ok: true }
    : { ok: false, reason: "incomplete-candidate", missing: finished.missing };
}

type ReviewMode = { kind: "initial" } | { kind: "revision"; regenerateLessonRefs: string[] };

export async function reviewCourseCandidate(
  context: GenerationContext,
  runId: string,
  mode: ReviewMode,
): Promise<
  | { state: "ready"; reviewRunId: string; correctedRefs: string[] }
  | { state: "published"; revisionNumber: number }
  | { state: "cancelled" | "review-failed" }
> {
  const courseId = context.course.id;
  const outlineVersion = context.outline.version;
  const resume = await resolveReviewResumePoint(courseId, outlineVersion);
  if (resume.action === "done") {
    return { state: "published", revisionNumber: resume.revisionNumber };
  }

  const touchCourse = mode.kind === "initial";
  let reviewRunId: string;
  let findings: ReviewFindingPayload[];
  if (resume.action === "publish") {
    reviewRunId = resume.reviewRunId;
    findings = [];
  } else {
    await stepMarkStep(runId, "review");
    reviewRunId = await stepOpenReviewRun(courseId, outlineVersion, touchCourse);
    findings = await runReviewRound(courseId, outlineVersion, reviewRunId, 0, runId);
  }

  const regenerated = new Set(mode.kind === "revision" ? mode.regenerateLessonRefs : []);
  const corrected = new Set<string>();
  let round = 0;
  while (findings.length > 0 && round < MAX_CORRECTION_ROUNDS) {
    round += 1;
    if (await stepGenerationCancelled(runId)) return { state: "cancelled" };
    await stepMarkStep(runId, `corrections:${round}`);
    const queries = dedupeCorrectionQueries(findings);
    if (queries.length > 0) {
      await stepFetchCorrectionSources(courseId, context.course.grounding, queries);
    }
    // Each step re-reads the candidate after the previous correction.
    for (const [lessonRef, lessonFindings] of groupFindingsByLesson(findings)) {
      if (await stepGenerationCancelled(runId)) return { state: "cancelled" };
      corrected.add(lessonRef);
      await stepCorrectLesson(courseId, outlineVersion, runId, lessonRef, lessonFindings, {
        preserveExercise: mode.kind === "revision" && !regenerated.has(lessonRef),
      });
    }
    await stepMarkCorrected(reviewRunId, round - 1);
    findings = await runReviewRound(courseId, outlineVersion, reviewRunId, round, runId);
  }

  if (findings.length > 0) {
    const suffix =
      mode.kind === "initial"
        ? "The Course was not published."
        : "The revision was not published; the current Course is unchanged.";
    await stepFailReview(
      courseId,
      reviewRunId,
      `The review still finds ${findings.length} problem(s) after ${MAX_CORRECTION_ROUNDS} correction rounds. ${suffix}`,
      touchCourse,
    );
    return { state: "review-failed" };
  }

  await stepFinishReviewRun(reviewRunId);
  return { state: "ready", reviewRunId, correctedRefs: [...corrected] };
}
