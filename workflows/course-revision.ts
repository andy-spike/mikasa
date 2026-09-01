/**
 * Durable staged revisions (ticket #14). A published Course's accepted
 * Change plan stages a candidate: the Outline version exists, the
 * unaffected Lessons are copied into it, and this workflow regenerates
 * only the affected Lessons, reviews only their content, and publishes
 * the whole candidate atomically — the current Course stays readable
 * until that swap.
 *
 * The shape is the main generation workflow's, deliberately: same steps,
 * same correction budget, same failure and resume rules (ticket #7).
 * Three differences: finishing the run never moves the Course's status
 * (it is "ready" and stays so), the review's model-driven scope is the
 * regenerated Lessons only, and publication refuses if a newer revision
 * exists — a stale candidate can never replace a newer Course.
 */
import type { PromptSource } from "@/lib/course/generate";
import type { GenerationContext } from "@/lib/db/lessons";
import type { OutlineLesson } from "@/lib/course/types";
import { MAX_CORRECTION_ROUNDS } from "@/lib/course/review";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "The revision failed.";
}

type ReviewPayload = {
  runId: string;
  round: number;
  findings: { kind: string; lessonRef: string | null; detail: string; correction: string }[];
};

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

async function stepOrder(context: GenerationContext): Promise<OutlineLesson[]> {
  "use step";
  const { generationOrder } = await import("@/lib/course/generate");
  return generationOrder(context.spec, context.outline.data);
}

/* One affected Lesson: the main workflow's own step. The copied Lessons
   are already written for this version, so the resume check in the
   workflow body skips them — "only affected Lessons rerun". */
async function stepGenerateLesson(
  context: GenerationContext,
  runId: string,
  lesson: OutlineLesson,
  nextLesson: OutlineLesson | null,
  priorLessons: { title: string; summary: string }[],
  extraSources: PromptSource[],
): Promise<{ newSource?: PromptSource }> {
  "use step";
  const { db } = await import("@/lib/db");
  const {
    planLessonSource,
    generateLesson,
    LESSON_SOURCE_LIMIT,
  } = await import("@/lib/course/generate");
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
      performance: context.spec.alignment.find((a) => a.lessonId === lesson.id)
        ?.performance,
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
  return { newSource };
}

/** Completeness only: the Course is published and stays that way. */
async function stepFinishStaged(
  courseId: string,
  outlineVersion: number,
  runId: string,
): Promise<{ ok: boolean; missing: number }> {
  "use step";
  const { finishGeneration } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  return finishGeneration(db, courseId, outlineVersion, runId, {
    promoteCourse: false,
  });
}

async function stepReviewRound(
  courseId: string,
  outlineVersion: number,
  runId: string,
  round: number,
  onlyLessonRefs: string[],
): Promise<ReviewPayload> {
  "use step";
  const { db } = await import("@/lib/db");
  const { structuralFindings, factualFindings, designFindings } = await import(
    "@/lib/course/review"
  );
  const {
    needsCodeVerification,
    planVerification,
    runVerification,
    verificationFindings,
  } = await import("@/lib/course/sandbox-verify");
  const { vercelSandboxProvider } = await import("@/lib/sandbox");
  const { generationModel } = await import("@/lib/model");
  const { loadGenerationContext, getLessonContentsForVersion } = await import(
    "@/lib/db/lessons"
  );
  const {
    saveFindings,
    recordReviewStep,
    saveCodeVerification,
    findCodeVerification,
  } = await import("@/lib/db/review");

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const lessonContents = await getLessonContentsForVersion(db, courseId, outlineVersion);
  const scope = lessonContents.filter((l) => onlyLessonRefs.includes(l.lessonId));

  const model = generationModel();
  const courseMeta = {
    topic: context.course.topic,
    goal: context.course.goal,
    language: context.course.language,
  };

  const found = [
    ...structuralFindings({
      spec: context.spec,
      outline: context.outline.data,
      lessons: lessonContents,
    }),
    ...(await factualFindings(model, courseMeta, context.spec, context.sources, scope)),
    ...(await designFindings(model, courseMeta, context.spec, context.outline.data, scope)),
  ];

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
      .map((l) => ({ title: l.title, summary: l.body.map(summaryOfBlock).join(" ").slice(0, 120) })),
  );
  await saveLessonContent(db, courseId, outlineVersion, runId, corrected);
}

function summaryOfBlock(block: unknown): string {
  const b = block as { text?: string };
  return b.text ?? "";
}

async function stepMarkCorrected(runId: string, round: number): Promise<void> {
  "use step";
  const { markFindingsCorrected } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await markFindingsCorrected(db, runId, round);
}

async function stepOpenReviewRun(
  courseId: string,
  outlineVersion: number,
): Promise<string> {
  "use step";
  const { openReviewRun } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  /* The Course is published: a staged review never moves its status. */
  const run = await openReviewRun(db, courseId, outlineVersion, {
    touchCourse: false,
  });
  return run.id;
}

async function stepFailReview(
  courseId: string,
  runId: string,
  message: string,
): Promise<void> {
  "use step";
  const { failReview } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await failReview(db, courseId, runId, message);
}

/**
 * The stale guard, the last step before publication: if a newer revision
 * exists, this candidate is obsolete and must never replace it.
 */
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
 * Re-embeds exactly the affected Lessons (ticket #14): regenerated and
 * retitled Lessons get fresh fragments, removed Lessons' fragments are
 * deleted, and every other Lesson's fragments stay as they are.
 */
async function stepEmbedAffected(
  courseId: string,
  outlineVersion: number,
  embedLessonRefs: string[],
): Promise<void> {
  "use step";
  if (embedLessonRefs.length === 0) return;
  const { db } = await import("@/lib/db");
  const { embedLessonFragments } = await import("@/lib/course/fragments");
  const { embedTexts } = await import("@/lib/model");
  await embedLessonFragments(db, embedTexts, courseId, outlineVersion, embedLessonRefs);
}

/** The plan's terminal states, written from the workflow. */
async function stepMarkPlan(
  planId: string,
  status: "published" | "failed",
): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { changePlans } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db
    .update(changePlans)
    .set({ status, updatedAt: new Date() })
    .where(eq(changePlans.id, planId));
}

async function stepFailRun(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failGeneration } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  /* The Course is published and stays on duty; only the run fails. */
  await failGeneration(db, courseId, runId, message, { touchCourse: false });
}

/** Marks a passed review as passed, so publication may look at it. */
async function stepFinishReviewRun(runId: string): Promise<void> {
  "use step";
  const { finishReviewRun } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await finishReviewRun(db, runId, "succeeded");
}

/**
 * One durable pass over a staged revision: regenerate the affected
 * Lessons (the copied ones are already written for this version), review
 * the whole candidate's structure and the affected content, correct at
 * most twice, refuse if the Course moved on, and publish atomically.
 * A failure leaves the current revision on duty and the plan staged —
 * a retry resumes from the first unwritten step, exactly like a new
 * Course's retry (ticket #7).
 */
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
    await stepFailRun(courseId, runId, "The staged revision's Course no longer exists.");
    await stepMarkPlan(planId, "failed");
    return { ok: false as const, reason: "course-not-found" };
  }

  try {
    const order = await stepOrder(context);
    await stepMarkStep(runId, "lessons");

    const extraSources: PromptSource[] = [];
    const priorLessons: { title: string; summary: string }[] = [];
    const already = new Set(context.written);

    for (let i = 0; i < order.length; i++) {
      /* Copied Lessons are written for this version: they are kept, not
         regenerated. Only the affected ones rerun. */
      if (already.has(order[i].id)) {
        priorLessons.push({ title: order[i].title, summary: order[i].summary });
        continue;
      }
      const nextLesson = order[i + 1] ?? null;
      const { newSource } = await stepGenerateLesson(
        context,
        runId,
        order[i],
        nextLesson,
        priorLessons,
        extraSources,
      );
      if (newSource) extraSources.push(newSource);
      priorLessons.push({ title: order[i].title, summary: order[i].summary });
    }

    const finished = await stepFinishStaged(courseId, outlineVersion, runId);
    if (!finished.ok) {
      return {
        ok: false as const,
        reason: "incomplete-candidate",
        missing: finished.missing,
      };
    }

    const reviewRunId = await stepOpenReviewRun(courseId, outlineVersion);
    let round = 0;
    let review = await stepReviewRound(
      courseId,
      outlineVersion,
      reviewRunId,
      round,
      regenerateLessonRefs,
    );

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

      review = await stepReviewRound(
        courseId,
        outlineVersion,
        reviewRunId,
        round,
        regenerateLessonRefs,
      );
    }

    if (review.findings.length > 0) {
      const message = `The review still finds ${review.findings.length} problem(s) after ${MAX_CORRECTION_ROUNDS} correction rounds. The revision was not published; the current Course is unchanged.`;
      await stepFailReview(courseId, reviewRunId, message);
      return { ok: false as const, reason: "review-failed" };
    }

    await stepFinishReviewRun(reviewRunId);

    /* The stale guard: a candidate drawn against revision N must never
       replace revision N+1. */
    const stillCurrent = await stepCheckStillCurrent(courseId, baseRevisionNumber);
    if (!stillCurrent.ok) {
      await stepFailReview(
        courseId,
        reviewRunId,
        `The Course moved to revision ${stillCurrent.current} while this revision was being prepared. The staged changes were discarded.`,
      );
      await stepMarkPlan(planId, "failed");
      return { ok: false as const, reason: "stale-revision" };
    }

    const published = await stepPublish(courseId, outlineVersion, reviewRunId);
    if (!published.ok) {
      await stepFailReview(courseId, reviewRunId, published.reason ?? "Publication failed.");
      return { ok: false as const, reason: "publish-failed" };
    }

    await stepEmbedAffected(courseId, outlineVersion, embedLessonRefs);
    await stepMarkPlan(planId, "published");
    return { ok: true as const, revisionNumber: published.revisionNumber };
  } catch (error) {
    /* The current Course is untouched; the plan stays staged, and a
       retry resumes from the first unwritten step. */
    await stepFailRun(courseId, runId, errorMessage(error));
    return { ok: false as const, reason: "revision-failed" };
  }
}
