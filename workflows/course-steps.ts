// Shared durable steps for Course generation and staged revisions. Both
// workflows generate Lessons one at a time in reading order, review the whole
// candidate with one structural pass plus one critical factual model pass,
// and correct affected Lessons one at a time.
import type { PromptSource } from "@/lib/course/generate";
import type { FindingKind } from "@/lib/course/review";
import { CORRECTION_SOURCE_QUERY_CAP } from "@/lib/course/review-policy";
import type { GenerationContext } from "@/lib/db/lessons";
import type { OutlineLesson } from "@/lib/course/types";

export type ReviewFindingPayload = {
  kind: FindingKind;
  lessonRef: string | null;
  detail: string;
  correction: string;
  sourceQuery?: string;
};

// Module loaders, resolved once so concurrent steps share one resolution. Resolving
// the same specifier from several steps at once can hand back the unmocked
// module in tests; one resolution per process avoids it. Production registries
// cache anyway, so this changes nothing there. They stay function calls inside
// step bodies so the workflow bundle keeps no server imports.
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => (cached ??= load());
}
const loadDb = once(() => import("@/lib/db"));
const loadDbLessons = once(() => import("@/lib/db/lessons"));
const loadDbOutline = once(() => import("@/lib/db/outline"));
const loadDbReview = once(() => import("@/lib/db/review"));
const loadDbSchema = once(() => import("@/lib/db/schema"));
const loadDrizzle = once(() => import("drizzle-orm"));
const loadGenerate = once(() => import("@/lib/course/generate"));
const loadSpecification = once(() => import("@/lib/course/specification"));
const loadDesign = once(() => import("@/lib/course/design"));
const loadReview = once(() => import("@/lib/course/review"));
const loadFragments = once(() => import("@/lib/course/fragments"));
const loadModel = once(() => import("@/lib/model"));

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "Course generation failed.";
}

export async function stepLoadContext(
  courseId: string,
  outlineVersion: number,
): Promise<GenerationContext | null> {
  "use step";
  const { loadGenerationContext } = await loadDbLessons();
  const { db } = await loadDb();
  const context = await loadGenerationContext(db, courseId, outlineVersion);
  return context ?? null;
}

export async function stepMarkStep(runId: string, step: string): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { generationRuns } = await loadDbSchema();
  const { eq } = await loadDrizzle();
  await db
    .update(generationRuns)
    .set({ currentStep: step, updatedAt: new Date() })
    .where(eq(generationRuns.id, runId));
}

export async function stepGenerationCancelled(runId: string): Promise<boolean> {
  "use step";
  const { generationRunCancelled } = await loadDbOutline();
  const { db } = await loadDb();
  return generationRunCancelled(db, runId);
}

export async function stepOrder(context: GenerationContext): Promise<OutlineLesson[]> {
  "use step";
  const { generationOrder } = await loadSpecification();
  return generationOrder(context.spec, context.outline.data);
}

// Validates the specification against the Outline reading order and stored
// Sources. Throws an actionable GenerationError on failure.
export async function stepValidateSpec(
  courseId: string,
  outlineVersion: number,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  "use step";
  const { loadGenerationContext } = await loadDbLessons();
  const { db } = await loadDb();
  const { validateSpecification } = await loadSpecification();
  const context = await loadGenerationContext(db, courseId, outlineVersion);
  if (!context) return { ok: false, errors: ["The Course to generate no longer exists."] };
  try {
    validateSpecification(
      context.spec,
      context.outline.data,
      new Set(context.sources.map((s) => s.ref)),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, errors: [errorMessage(error)] };
  }
}

// One conditional repair: reconcile with the validation errors, then save.
// Called at most once per attempt.
export async function stepRepairSpec(
  courseId: string,
  outlineVersion: number,
  errors: string[],
  adjustments: {
    lessonId: string;
    prose?: string;
    exercise?: { task: string; check: string };
  }[] = [],
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { generationModel } = await loadModel();
  const { reconcileSpecification } = await import("@/lib/course/reconcile");
  const { loadGenerationContext } = await loadDbLessons();
  const { saveReconciledSpec } = await loadDbOutline();
  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const reconciled = await reconcileSpecification(
    generationModel(),
    context.outline.data,
    context.spec,
    adjustments as never,
    errors,
  );
  await saveReconciledSpec(db, courseId, reconciled, outlineVersion);
}

// Per-Lesson Source planning is gone from the normal path: generation writes
// with the stored Source pool, and only correction rounds fetch.

// Correction searches only: deduped factual sourceQuery values, at most
// three per round in stable finding order, none when Grounding is off.
// Reuses the existing search and Source-storage functions.
export async function stepFetchCorrectionSources(
  courseId: string,
  grounding: boolean,
  queries: string[],
): Promise<PromptSource[]> {
  "use step";
  if (!grounding || queries.length === 0) return [];
  const { db } = await loadDb();
  const { LESSON_SOURCE_LIMIT } = await loadGenerate();
  const { saveLessonSource } = await loadDbLessons();
  const { firecrawlSearcher } = await loadDesign();
  const seen = new Set<string>();
  const capped: string[] = [];
  for (const q of queries) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    capped.push(q.trim());
    if (capped.length >= CORRECTION_SOURCE_QUERY_CAP) break;
  }
  const out: PromptSource[] = [];
  for (const query of capped) {
    const pages = await firecrawlSearcher()(query, LESSON_SOURCE_LIMIT);
    const page = pages[0];
    if (!page || page.content.trim().length === 0) continue;
    const ref = await saveLessonSource(db, courseId, {
      title: page.title,
      url: page.url,
      excerpt: page.content.slice(0, 600).trim(),
    });
    out.push({ ref, title: page.title, url: page.url, excerpt: page.content.slice(0, 600).trim() });
  }
  return out;
}

export async function stepGenerateLesson(
  context: GenerationContext,
  runId: string,
  lessonId: string,
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { generateLesson } = await loadGenerate();
  const { getLessonContentsForVersion, saveLessonContent } = await loadDbLessons();
  const { lessonContextExcerpt } = await loadReview();
  const { generationModel } = await loadModel();

  // Sequential generation (ADR 0009): the Lesson sees the actual prose of
  // every Lesson before it in reading order, so it continues what exists —
  // shared scaffolding, names, example state — instead of inventing its own.
  // The Lesson, its successor, and the Source pool all derive from the
  // context, so callers pass no stale snapshots.
  const order = context.outline.data.modules.flatMap((m) => m.lessons);
  const current = order.findIndex((l) => l.id === lessonId);
  if (current < 0) throw new Error(`The Outline has no Lesson "${lessonId}".`);
  const lesson = order[current];
  const nextLesson = order[current + 1] ?? null;
  const sources = context.sources;
  const written = await getLessonContentsForVersion(db, context.course.id, context.outline.version);
  const excerptOf = new Map(written.map((c) => [c.lessonId, lessonContextExcerpt(c)]));
  const priorLessons = order
    .slice(0, current)
    .map((l) => ({ title: l.title, summary: l.summary, excerpt: excerptOf.get(l.id) }));

  const content = await generateLesson(generationModel(), {
    course: context.course,
    spec: context.spec,
    lesson,
    nextLesson,
    priorLessons,
    sources,
  });
  await saveLessonContent(db, context.course.id, context.outline.version, runId, content);
}

export async function stepFinish(
  courseId: string,
  outlineVersion: number,
  runId: string,
  promoteCourse: boolean,
): Promise<{ ok: boolean; missing: number }> {
  "use step";
  const { finishGeneration } = await loadDbLessons();
  const { db } = await loadDb();
  return finishGeneration(db, courseId, outlineVersion, runId, { promoteCourse });
}

export async function stepFailGeneration(
  courseId: string,
  runId: string,
  message: string,
  touchCourse: boolean,
): Promise<void> {
  "use step";
  const { failGeneration } = await loadDbLessons();
  const { db } = await loadDb();
  await failGeneration(db, courseId, runId, message, { touchCourse });
}

export async function stepStructuralReview(
  courseId: string,
  outlineVersion: number,
): Promise<ReviewFindingPayload[]> {
  "use step";
  const { db } = await loadDb();
  const { structuralFindings } = await loadReview();
  const { loadGenerationContext, getLessonContentsForVersion } = await loadDbLessons();

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const lessonContents = await getLessonContentsForVersion(db, courseId, outlineVersion);
  return structuralFindings({
    spec: context.spec,
    outline: context.outline.data,
    lessons: lessonContents,
    storedSources: context.sources,
  });
}

// One critical factual model review over the complete candidate. Invalid or
// empty targets throw, never pass.
export async function stepCombinedReview(
  courseId: string,
  outlineVersion: number,
): Promise<ReviewFindingPayload[]> {
  "use step";
  const { db } = await loadDb();
  const { combinedFindings } = await loadReview();
  const { generationModel } = await loadModel();
  const { loadGenerationContext, getLessonContentsForVersion } = await loadDbLessons();

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const lessonContents = await getLessonContentsForVersion(db, courseId, outlineVersion);
  return combinedFindings(
    generationModel(),
    {
      topic: context.course.topic,
      goal: context.course.goal,
      language: context.course.language,
    },
    context.spec,
    context.outline.data,
    context.sources,
    lessonContents,
  );
}

export async function stepSaveReviewFindings(
  reviewRunId: string,
  courseId: string,
  outlineVersion: number,
  round: number,
  findings: ReviewFindingPayload[],
  generationRunId?: string,
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { saveFindings, recordReviewStep } = await loadDbReview();
  await recordReviewStep(db, reviewRunId, round);
  await saveFindings(
    db,
    reviewRunId,
    courseId,
    outlineVersion,
    round,
    findings,
    generationRunId ? { generationRunId } : undefined,
  );
}

// Structural checks run first. The critical factual model review runs only
// when structure permits it.
export async function runReviewRound(
  courseId: string,
  outlineVersion: number,
  reviewRunId: string,
  round: number,
  generationRunId?: string,
): Promise<ReviewFindingPayload[]> {
  const structural = await stepStructuralReview(courseId, outlineVersion);
  if (structural.length > 0) {
    await stepSaveReviewFindings(
      reviewRunId,
      courseId,
      outlineVersion,
      round,
      structural,
      generationRunId,
    );
    return structural;
  }
  const findings = await stepCombinedReview(courseId, outlineVersion);
  await stepSaveReviewFindings(
    reviewRunId,
    courseId,
    outlineVersion,
    round,
    findings,
    generationRunId,
  );
  return findings;
}

export async function stepCorrectLesson(
  courseId: string,
  outlineVersion: number,
  runId: string,
  lessonRef: string,
  findings: ReviewFindingPayload[],
  options?: { preserveExercise?: boolean },
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { generationModel } = await loadModel();
  const { loadGenerationContext, getLessonContentsForVersion, saveLessonContent } =
    await loadDbLessons();

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const all = await getLessonContentsForVersion(db, courseId, outlineVersion);
  const current = all.find((l) => l.lessonId === lessonRef);
  if (!current) return;

  const { correctLesson, lessonContextExcerpt } = await loadReview();

  // Corrections reconcile against the candidate as it stands: every other
  // Lesson's current content, so fixes agree with what the review judged.
  // Generation keeps to summaries by design; corrections cannot repair
  // cross-Lesson claims they cannot see.
  const order = context.outline.data.modules.flatMap((m) => m.lessons);
  const prior = order
    .filter((l) => l.id !== lessonRef)
    .map((l) => {
      const content = all.find((x) => x.lessonId === l.id);
      return {
        title: l.title,
        summary: l.summary,
        excerpt: content ? lessonContextExcerpt(content) : undefined,
      };
    });

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
    prior,
    { preserveExercise: options?.preserveExercise, sources: context.sources },
  );
  // Explicit Learner Exercise requirements survive corrections: the
  // specification's adjustment is the authority, not the model's rewrite.
  const adjustment = context.spec.adjustments?.find((a) => a.lessonId === lessonRef);
  const finalContent =
    adjustment?.exercise && !options?.preserveExercise
      ? {
          ...corrected,
          exercise: { task: adjustment.exercise.task, check: adjustment.exercise.check },
        }
      : corrected;
  await saveLessonContent(db, courseId, outlineVersion, runId, finalContent, { touchRun: false });
}

export function groupFindingsByLesson(
  findings: ReviewFindingPayload[],
): Map<string, ReviewFindingPayload[]> {
  const byLesson = new Map<string, ReviewFindingPayload[]>();
  for (const finding of findings) {
    if (!finding.lessonRef) continue;
    const list = byLesson.get(finding.lessonRef) ?? [];
    list.push(finding);
    byLesson.set(finding.lessonRef, list);
  }
  return byLesson;
}

export async function stepMarkCorrected(reviewRunId: string, round: number): Promise<void> {
  "use step";
  const { markFindingsCorrected } = await loadDbReview();
  const { db } = await loadDb();
  await markFindingsCorrected(db, reviewRunId, round);
}

export async function stepOpenReviewRun(
  courseId: string,
  outlineVersion: number,
  touchCourse: boolean,
): Promise<string> {
  "use step";
  const { openReviewRun } = await loadDbReview();
  const { db } = await loadDb();
  const run = await openReviewRun(
    db,
    courseId,
    outlineVersion,
    touchCourse ? undefined : { touchCourse: false },
  );
  return run.id;
}

export async function stepFinishReviewRun(reviewRunId: string): Promise<void> {
  "use step";
  const { finishReviewRun } = await loadDbReview();
  const { db } = await loadDb();
  await finishReviewRun(db, reviewRunId, "succeeded");
}

export async function stepFailReview(
  courseId: string,
  reviewRunId: string,
  message: string,
  touchCourse: boolean,
): Promise<void> {
  "use step";
  const { failReview } = await loadDbReview();
  const { db } = await loadDb();
  await failReview(
    db,
    courseId,
    reviewRunId,
    message,
    touchCourse ? undefined : { touchCourse: false },
  );
}

export async function stepPublish(
  courseId: string,
  outlineVersion: number,
  reviewRunId: string,
  generationRunId?: string,
  baseRevisionNumber?: number,
): Promise<{ ok: boolean; reason?: string; revisionNumber?: number }> {
  "use step";
  const { publishRevision } = await loadDbReview();
  const { db } = await loadDb();
  const result = await publishRevision(db, courseId, outlineVersion, reviewRunId, {
    ...(generationRunId ? { generationRunId } : {}),
    ...(baseRevisionNumber !== undefined ? { baseRevisionNumber } : {}),
  });
  return result.ok
    ? { ok: true, revisionNumber: result.revision.revisionNumber }
    : { ok: false, reason: result.reason };
}

export async function stepRecordExpandedTouched(
  planId: string,
  lessonRefs: string[],
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { changePlans } = await loadDbSchema();
  const { eq } = await loadDrizzle();
  const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId)).limit(1);
  if (!plan) return;
  const current = new Set([...(plan.touchedLessons ?? []), ...(plan.regeneratedLessons ?? [])]);
  let changed = false;
  for (const ref of lessonRefs) {
    if (!current.has(ref)) {
      current.add(ref);
      changed = true;
    }
  }
  if (!changed) return;
  await db
    .update(changePlans)
    .set({ touchedLessons: [...current], updatedAt: new Date() })
    .where(eq(changePlans.id, planId));
}

export async function stepEmbedFragments(
  courseId: string,
  outlineVersion: number,
  runId: string,
  lessonRefs?: string[],
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { embedCourseFragments, embedLessonFragments } = await loadFragments();
  const { embedTexts } = await loadModel();
  const { generationRuns } = await loadDbSchema();
  const { eq } = await loadDrizzle();
  try {
    if (lessonRefs) {
      await embedLessonFragments(db, embedTexts, courseId, outlineVersion, lessonRefs);
    } else {
      await embedCourseFragments(db, embedTexts, courseId, outlineVersion);
    }
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

export type ReviewResumePoint =
  | { action: "done"; revisionNumber: number }
  | { action: "publish"; reviewRunId: string }
  | { action: "review" };

// One shared resume check for both workflows. A revision for this Outline
// version means published. A succeeded review with no open findings resumes
// at publication only when no Lesson was written after the review finished.
export async function resolveReviewResumePoint(
  courseId: string,
  outlineVersion: number,
): Promise<ReviewResumePoint> {
  "use step";
  const { db } = await loadDb();
  const { latestReviewRun } = await loadDbReview();
  const { revisions, reviewFindings, lessons } = await loadDbSchema();
  const { and, desc, eq } = await loadDrizzle();

  const [revision] = await db
    .select({ revisionNumber: revisions.revisionNumber })
    .from(revisions)
    .where(and(eq(revisions.courseId, courseId), eq(revisions.outlineVersion, outlineVersion)))
    .limit(1);
  if (revision) return { action: "done", revisionNumber: revision.revisionNumber };

  const review = await latestReviewRun(db, courseId);
  if (review && review.outlineVersion === outlineVersion && review.status === "succeeded") {
    const [latestLesson] = await db
      .select({ updatedAt: lessons.updatedAt })
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, outlineVersion)))
      .orderBy(desc(lessons.updatedAt))
      .limit(1);
    if (latestLesson && latestLesson.updatedAt > review.updatedAt) {
      return { action: "review" };
    }
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

export type ValidSpec =
  | { ok: true; context: GenerationContext }
  | { ok: false; reason: "course-not-found" }
  | { ok: false; reason: "repair-failed"; error: string }
  | { ok: false; reason: "invalid-spec"; errors: string[] };

// One shared validate plus single-repair path. Both workflows reconcile
// before this runs, so this repairs once more at most, then reports.
export async function ensureValidSpec(
  courseId: string,
  outlineVersion: number,
): Promise<ValidSpec> {
  const context = await stepLoadContext(courseId, outlineVersion);
  if (!context) return { ok: false, reason: "course-not-found" };

  const first = await stepValidateSpec(courseId, outlineVersion);
  if (first.ok) return { ok: true, context };

  const errors = (first as { ok: false; errors: string[] }).errors;
  try {
    await stepRepairSpec(courseId, outlineVersion, errors, context.spec.adjustments ?? []);
  } catch (repairError) {
    return {
      ok: false,
      reason: "repair-failed",
      error:
        repairError instanceof Error && repairError.message
          ? repairError.message
          : "The Course specification could not be repaired.",
    };
  }
  const reloaded = await stepLoadContext(courseId, outlineVersion);
  if (!reloaded) return { ok: false, reason: "course-not-found" };
  const second = await stepValidateSpec(courseId, outlineVersion);
  if (!second.ok) {
    return {
      ok: false,
      reason: "invalid-spec",
      errors: (second as { ok: false; errors: string[] }).errors,
    };
  }
  return { ok: true, context: reloaded };
}
