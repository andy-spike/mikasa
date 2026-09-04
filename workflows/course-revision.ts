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
  return { newSource };
}

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

async function stepMarkCorrected(runId: string, round: number): Promise<void> {
  "use step";
  const { markFindingsCorrected } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await markFindingsCorrected(db, runId, round);
}

async function stepOpenReviewRun(courseId: string, outlineVersion: number): Promise<string> {
  "use step";
  const { openReviewRun } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  const run = await openReviewRun(db, courseId, outlineVersion, {
    touchCourse: false,
  });
  return run.id;
}

async function stepFailReview(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failReview } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await failReview(db, courseId, runId, message, { touchCourse: false });
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

async function stepEmbedAffected(
  courseId: string,
  outlineVersion: number,
  embedLessonRefs: string[],
  runId: string,
): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { embedLessonFragments } = await import("@/lib/course/fragments");
  const { embedTexts } = await import("@/lib/model");
  const { generationRuns } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  try {
    await embedLessonFragments(db, embedTexts, courseId, outlineVersion, embedLessonRefs);
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

async function stepFailRun(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failGeneration } = await import("@/lib/db/lessons");
  const { db } = await import("@/lib/db");
  await failGeneration(db, courseId, runId, message, { touchCourse: false });
}

async function stepFinishReviewRun(runId: string): Promise<void> {
  "use step";
  const { finishReviewRun } = await import("@/lib/db/review");
  const { db } = await import("@/lib/db");
  await finishReviewRun(db, runId, "succeeded");
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
    await stepFailRun(courseId, runId, "The staged revision's Course no longer exists.");
    await stepMarkPlan(planId, "failed");
    return { ok: false as const, reason: "course-not-found" };
  }

  try {
    const prepared = await stepReconcileSpec(planId, context, runId);
    const order = await stepOrder(prepared);
    await stepMarkStep(runId, "lessons");

    const extraSources: PromptSource[] = [];
    const priorLessons: { title: string; summary: string }[] = [];
    const already = new Set(prepared.written);

    for (let i = 0; i < order.length; i++) {
      if (already.has(order[i].id)) {
        priorLessons.push({ title: order[i].title, summary: order[i].summary });
        continue;
      }
      const nextLesson = order[i + 1] ?? null;
      const { newSource } = await stepGenerateLesson(
        prepared,
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

    const resume = await stepReviewResumePoint(courseId, outlineVersion);
    if (resume.action === "done") {
      await stepEmbedAffected(courseId, outlineVersion, embedLessonRefs, runId);
      await stepMarkPlan(planId, "published", resume.revisionNumber);
      return { ok: true as const, revisionNumber: resume.revisionNumber };
    }

    let round = 0;
    let reviewRunId: string;
    let review: ReviewPayload;
    if (resume.action === "publish") {
      reviewRunId = resume.reviewRunId;
      review = { runId: reviewRunId, round: 0, findings: [] };
    } else {
      await stepMarkStep(runId, "review");
      reviewRunId = await stepOpenReviewRun(courseId, outlineVersion);
      review = await stepReviewRound(
        courseId,
        outlineVersion,
        reviewRunId,
        0,
        regenerateLessonRefs,
      );
    }

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

    const stillCurrent = await stepCheckStillCurrent(courseId, baseRevisionNumber);
    if (!stillCurrent.ok) {
      await stepFailRun(
        courseId,
        runId,
        `The Course moved to revision ${stillCurrent.current} while this revision was being prepared. The staged changes were discarded.`,
      );
      await stepMarkPlan(planId, "failed");
      return { ok: false as const, reason: "stale-revision" };
    }

    await stepMarkStep(runId, "publish");
    const published = await stepPublish(courseId, outlineVersion, reviewRunId);
    if (!published.ok) {
      // Review stays succeeded so a retry resumes at publication.
      await stepFailRun(
        courseId,
        runId,
        `Publication failed: ${published.reason ?? "The revision could not be published."}`,
      );
      return { ok: false as const, reason: "publish-failed" };
    }

    await stepEmbedAffected(courseId, outlineVersion, embedLessonRefs, runId);
    await stepMarkPlan(planId, "published", published.revisionNumber);
    return { ok: true as const, revisionNumber: published.revisionNumber };
  } catch (error) {
    await stepFailRun(courseId, runId, errorMessage(error));
    return { ok: false as const, reason: "revision-failed" };
  }
}
