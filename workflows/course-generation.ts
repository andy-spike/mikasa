/**
 * Durable Course generation (ADR 0005), started by Outline approval
 * (ticket #4). One Workflow step per Lesson: a failure costs one Lesson's
 * work, and the engine's step memoization means a retry (ticket #7)
 * resumes from the first unwritten Lesson, not from zero.
 *
 * This file owns only the Workflow shape; everything substantive lives in
 * `lib/course/generate` (plain functions, injected providers) and
 * `lib/db/lessons` (state).
 */
import type { LessonContent } from "@/lib/course/content";
import type { PromptSource } from "@/lib/course/generate";
import type { GenerationContext } from "@/lib/db/lessons";
import type { OutlineLesson } from "@/lib/course/types";
import { MAX_CORRECTION_ROUNDS } from "@/lib/course/review";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "Course generation failed.";
}

async function stepLoadContext(
  courseId: string,
  outlineVersion: number,
): Promise<GenerationContext | null> {
  "use step";
  const { loadGenerationContext } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  const context = await loadGenerationContext(db, courseId, outlineVersion);
  return context ?? null;
}

async function stepMarkStep(runId: string, step: string): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { generationRuns } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db
    .update(generationRuns)
    .set({ currentStep: step, updatedAt: new Date() })
    .where(eq(generationRuns.id, runId));
}

/** The declared order for this Outline version; a broken graph fails here. */
async function stepOrder(context: GenerationContext): Promise<OutlineLesson[]> {
  "use step";
  const { generationOrder } = await import("@/lib/course/generate");
  return generationOrder(context.spec, context.outline.data);
}

/**
 * One Lesson: decide whether it needs a Lesson-specific Source (only when
 * Grounding is on), fetch and store it if so, then write and persist the
 * Lesson. The new Source's ref rides back so the next lessons' prompts
 * can cite it too.
 */
async function stepGenerateLesson(
  context: GenerationContext,
  runId: string,
  lesson: OutlineLesson,
  nextLesson: OutlineLesson | null,
  priorLessons: { title: string; summary: string }[],
  extraSources: PromptSource[],
): Promise<{ content: LessonContent; newSource?: PromptSource }> {
  "use step";
  const { db } = await import("@/lib/db");
  const { planLessonSource, generateLesson, LESSON_SOURCE_LIMIT } =
    await import("@/lib/course/generate");
  const { saveLessonContent, saveLessonSource } = await import("@/lib/db/lessons");
  const { generationModel } = await import("@/lib/model");
  const { firecrawlSearcher } = await import("@/lib/course/design");

  const model = generationModel();
  const sources = [...context.sources, ...extraSources];

  const plan = await planLessonSource(
    model,
    context.course,
    {
      title: lesson.title,
      summary: lesson.summary,
      performance: context.spec.alignment.find((a) => a.lessonId === lesson.id)?.performance,
    },
    sources,
  );

  let newSource: PromptSource | undefined;
  if (plan.needsSource && plan.query) {
    const pages = await firecrawlSearcher()(plan.query, LESSON_SOURCE_LIMIT);
    const page = pages[0];
    if (page && page.content.trim().length > 0) {
      const excerpt = page.content.slice(0, 600).trim();
      const ref = await saveLessonSource(db, context.course.id, {
        title: page.title,
        url: page.url,
        excerpt,
      });
      newSource = { ref, title: page.title, url: page.url, excerpt };
    }
  }

  const content = await generateLesson(model, {
    course: context.course,
    spec: context.spec,
    lesson,
    nextLesson,
    priorLessons,
    sources: newSource ? [...sources, newSource] : sources,
  });

  await saveLessonContent(db, context.course.id, context.outline.version, runId, content);
  return { content, newSource };
}

async function stepFinish(
  courseId: string,
  outlineVersion: number,
  runId: string,
): Promise<{ ok: boolean; missing: number }> {
  "use step";
  const { finishGeneration } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  return finishGeneration(db, courseId, outlineVersion, runId);
}

async function stepFail(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failGeneration } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  await failGeneration(db, courseId, runId, message);
}

/* ------------------------------------------------------------------ */
/* Review and publication (ticket #6).                                 */

type ReviewPayload = {
  runId: string;
  round: number;
  findings: { kind: string; lessonRef: string | null; detail: string; correction: string }[];
};

/** One full review pass: structural (pure), factual and code, learning design, and — for a coding Course — the Sandbox.
 *
 * `onlyLessonRefs` scopes the model-driven work to the named Lessons
 * (ticket #14): a staged revision reruns factual, design, and Sandbox
 * work only for the regenerated Lessons, whose content is the only
 * content that changed. The structural pass stays whole-Course — it is
 * pure, and the Outline itself is what changed.
 */
async function stepReviewRound(
  courseId: string,
  outlineVersion: number,
  runId: string,
  round: number,
  onlyLessonRefs?: string[],
): Promise<ReviewPayload> {
  "use step";
  const { db } = await import("@/lib/db");
  const { structuralFindings, factualFindings, designFindings } =
    await import("@/lib/course/review");
  const { needsCodeVerification, planVerification, runVerification, verificationFindings } =
    await import("@/lib/course/sandbox-verify");
  const { vercelSandboxProvider } = await import("@/lib/sandbox");
  const { generationModel } = await import("@/lib/model");
  const { loadGenerationContext, getLessonContentsForVersion } = await import("@/lib/db/lessons");
  const { saveFindings, recordReviewStep, saveCodeVerification, findCodeVerification } =
    await import("@/lib/db/review");

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const lessonContents = await getLessonContentsForVersion(db, courseId, outlineVersion);

  const model = generationModel();
  const courseMeta = {
    topic: context.course.topic,
    goal: context.course.goal,
    language: context.course.language,
  };

  /* The review's model-driven scope: everything, or — for a staged
     revision — only the regenerated Lessons. */
  const scope =
    onlyLessonRefs && onlyLessonRefs.length > 0
      ? lessonContents.filter((l) => onlyLessonRefs.includes(l.lessonId))
      : lessonContents;

  const found = [
    ...structuralFindings({
      spec: context.spec,
      outline: context.outline.data,
      lessons: lessonContents,
    }),
    ...(await factualFindings(model, courseMeta, context.spec, context.sources, scope)),
    ...(await designFindings(model, courseMeta, context.spec, context.outline.data, scope)),
  ];

  /* Executable claims (ticket #9): only a coding Course creates Sandbox
     work; a coding Course re-verifies after every correction round, since
     corrections may have rewritten the code. A pass already recorded for
     this round is reused, so a Workflow retry does not re-run the
     Sandbox. */
  if (needsCodeVerification(context.course, scope)) {
    const existing = await findCodeVerification(db, courseId, outlineVersion, round);
    if (!existing) {
      const plan = await planVerification(model, context.course, context.spec, scope);
      const result = await runVerification(vercelSandboxProvider(), plan);
      await saveCodeVerification(db, courseId, outlineVersion, round, result);
      found.push(
        ...verificationFindings(result).map((f) => ({
          kind: "code-execution" as const,
          lessonRef: f.lessonRef,
          detail: f.detail,
          correction: f.correction,
        })),
      );
    } else {
      const evidence = existing.evidence as {
        commands?: {
          run: string;
          lessonRef: string;
          exitCode: number;
          stderr: string;
          proves?: string;
        }[];
      };
      found.push(
        ...(evidence.commands ?? [])
          .filter((c) => c.exitCode !== 0)
          .map((c) => ({
            kind: "code-execution" as const,
            lessonRef: c.lessonRef,
            detail: `The command "${c.run}" exited with code ${c.exitCode}${
              c.stderr ? `: ${c.stderr.trim().slice(0, 300)}` : ""
            }. It was meant to prove: ${c.proves ?? "the Lesson's claim"}`,
            correction: `Fix the Lesson's code so that "${c.run}" runs cleanly.`,
          })),
      );
    }
  }

  await recordReviewStep(db, runId, round);
  await saveFindings(db, runId, courseId, outlineVersion, round, found);
  return { runId, round, findings: found };
}

/** Rewrites one affected Lesson against its findings and saves it. */
async function stepCorrectLesson(
  courseId: string,
  outlineVersion: number,
  runId: string,
  lessonRef: string,
  findings: ReviewPayload["findings"],
): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { correctLesson } = await import("@/lib/course/review");
  const { generationModel } = await import("@/lib/model");
  const { loadGenerationContext, getLessonContentsForVersion, saveLessonContent } =
    await import("@/lib/db/lessons");

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const all = await getLessonContentsForVersion(db, courseId, outlineVersion);
  const current = all.find((l) => l.lessonId === lessonRef);
  if (!current) return;

  const corrected = await correctLesson(
    generationModel(),
    {
      topic: context.course.topic,
      goal: context.course.goal,
      language: context.course.language,
    },
    context.spec,
    current,
    findings as Parameters<typeof correctLesson>[4],
    all
      .filter((l) => l.lessonId !== lessonRef)
      .map((l) => ({
        title: l.title,
        summary: l.body.map(summaryOfBlock).join(" ").slice(0, 120),
      })),
  );
  await saveLessonContent(db, courseId, outlineVersion, runId, corrected);
}

function summaryOfBlock(block: unknown): string {
  const b = block as { text?: string };
  return b.text ?? "";
}

/** The findings just corrected become "corrected"; the next round starts clean. */
async function stepMarkCorrected(runId: string, round: number): Promise<void> {
  "use step";
  const { markFindingsCorrected } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await markFindingsCorrected(db, runId, round);
}

async function stepPublish(
  courseId: string,
  outlineVersion: number,
  reviewRunId: string,
): Promise<{ ok: boolean; reason?: string; revisionNumber?: number }> {
  "use step";
  const { publishRevision } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  const result = await publishRevision(db, courseId, outlineVersion, reviewRunId);
  return result.ok
    ? { ok: true, revisionNumber: result.revision.revisionNumber }
    : { ok: false, reason: result.reason };
}

/**
 * Embeds the published Lessons' fragments (ticket #11), so the Tutor's
 * Course search answers from exactly what was just published. Runs after
 * the revision exists; re-running replaces the fragments wholesale. An
 * embedding failure is recorded on the run alone (bug 9): the Course
 * stays ready and the repair workflow can finish the job later.
 */
async function stepEmbedFragments(
  courseId: string,
  outlineVersion: number,
  runId: string,
): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { embedCourseFragments } = await import("@/lib/course/fragments");
  const { embedTexts } = await import("@/lib/model");
  const { generationRuns } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  try {
    await embedCourseFragments(db, embedTexts, courseId, outlineVersion);
    await db
      .update(generationRuns)
      .set({ fragmentsStatus: "done", fragmentsError: null, updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
  } catch (error) {
    await db
      .update(generationRuns)
      .set({
        fragmentsStatus: "failed",
        fragmentsError: errorMessage(error),
        updatedAt: new Date(),
      })
      .where(eq(generationRuns.id, runId));
  }
}

async function stepFailReview(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failReview } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await failReview(db, courseId, runId, message);
}

/** Marks a passed review as passed, so publication may look at it. */
async function stepFinishReviewRun(runId: string): Promise<void> {
  "use step";
  const { finishReviewRun } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await finishReviewRun(db, runId, "succeeded");
}

async function stepOpenReviewRun(courseId: string, outlineVersion: number): Promise<string> {
  "use step";
  const { openReviewRun } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  const run = await openReviewRun(db, courseId, outlineVersion);
  return run.id;
}

/**
 * Where a retry re-enters (ticket #7). A review that already passed with
 * no open findings is not run again: the run resumes at publication. A
 * Course whose revision is already published has nothing left to do.
 */
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

/**
 * One durable pass over an approved Outline version: load, order, write
 * every Lesson in dependency order (Module by Module — the Outline's
 * order within a Module is the Learner's approved order), then review the
 * complete candidate, correct at most twice, and publish atomically. A
 * candidate that still has findings after the second correction round
 * fails the Course, unpublished and retryable.
 */
export async function generateCourseWorkflow(
  courseId: string,
  runId: string,
  outlineVersion: number,
) {
  "use workflow";

  const context = await stepLoadContext(courseId, outlineVersion);
  if (!context) {
    await stepFail(courseId, runId, "The Course to generate no longer exists.");
    return { ok: false as const, reason: "course-not-found" };
  }

  try {
    const order = await stepOrder(context);
    await stepMarkStep(runId, "lessons");

    const extraSources: PromptSource[] = [];
    const priorLessons: { title: string; summary: string }[] = [];
    const already = new Set(context.written);

    for (let i = 0; i < order.length; i++) {
      /* Resume (ticket #7): a Lesson the failed run already wrote is
         kept, not regenerated. */
      if (already.has(order[i].id)) {
        priorLessons.push({ title: order[i].title, summary: order[i].summary });
        continue;
      }
      const { newSource } = await stepGenerateLesson(
        context,
        runId,
        order[i],
        order[i + 1] ?? null,
        priorLessons,
        extraSources,
      );
      if (newSource) extraSources.push(newSource);
      priorLessons.push({ title: order[i].title, summary: order[i].summary });
    }

    const finished = await stepFinish(courseId, outlineVersion, runId);
    if (!finished.ok) {
      return {
        ok: false as const,
        reason: "incomplete-candidate",
        missing: finished.missing,
      };
    }

    /* Review: structural + factual and code + learning design, then at
       most two rounds of targeted corrections. A retry whose review
       already passed resumes at publication instead. */
    const resume = await stepReviewResumePoint(courseId, outlineVersion);
    if (resume.action === "done") {
      return { ok: true as const, revisionNumber: resume.revisionNumber };
    }

    let reviewRunId: string;
    let review: ReviewPayload;
    if (resume.action === "publish") {
      reviewRunId = resume.reviewRunId;
      review = { runId: reviewRunId, round: 0, findings: [] };
    } else {
      await stepMarkStep(runId, "review");
      reviewRunId = await stepOpenReviewRun(courseId, outlineVersion);
      review = await stepReviewRound(courseId, outlineVersion, reviewRunId, 0);
    }

    let round = review.round;
    while (review.findings.length > 0 && round < MAX_CORRECTION_ROUNDS) {
      round += 1;
      await stepMarkStep(runId, `corrections:${round}`);

      const byLesson = new Map<string, ReviewPayload["findings"]>();
      for (const finding of review.findings) {
        if (!finding.lessonRef) continue;
        const list = byLesson.get(finding.lessonRef) ?? [];
        list.push(finding);
        byLesson.set(finding.lessonRef, list);
      }
      for (const [lessonRef, findings] of byLesson) {
        await stepCorrectLesson(courseId, outlineVersion, runId, lessonRef, findings);
      }
      await stepMarkCorrected(reviewRunId, round - 1);

      review = await stepReviewRound(courseId, outlineVersion, reviewRunId, round);
    }

    if (review.findings.length > 0) {
      const message = `The review still finds ${review.findings.length} problem(s) after ${MAX_CORRECTION_ROUNDS} correction rounds. The Course was not published.`;
      await stepFailReview(courseId, reviewRunId, message);
      return { ok: false as const, reason: "review-failed" };
    }

    /* The review passed: record that, so publication's own guard sees a
       passed run and a retry resumes at publication, not through it. */
    await stepFinishReviewRun(reviewRunId);

    await stepMarkStep(runId, "publish");
    const published = await stepPublish(courseId, outlineVersion, reviewRunId);
    if (!published.ok) {
      /* The review stays succeeded: a retry resumes at publication
         instead of reviewing from round 0 (bug 2). The Course fails with
         the run, so it stays retryable from the Courses screen. */
      await stepFail(courseId, runId, published.reason ?? "Publication failed.");
      return { ok: false as const, reason: "publish-failed" };
    }
    await stepEmbedFragments(courseId, outlineVersion, runId);
    return { ok: true as const, revisionNumber: published.revisionNumber };
  } catch (error) {
    await stepFail(courseId, runId, errorMessage(error));
    return { ok: false as const, reason: "generation-failed" };
  }
}
