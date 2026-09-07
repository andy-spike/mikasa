// Shared durable steps for Course generation and staged revisions. Both
// workflows generate Lessons in parallel waves, review the slices in
// parallel, and correct Lessons in parallel; this file owns those steps so
// the two orchestrators cannot drift apart again.
import type { PromptSource } from "@/lib/course/generate";
import type { FindingKind } from "@/lib/course/review";
import type { GenerationContext } from "@/lib/db/lessons";
import type { OutlineLesson } from "@/lib/course/types";

export type ReviewFindingPayload = {
  kind: FindingKind;
  lessonRef: string | null;
  detail: string;
  correction: string;
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
const loadDesign = once(() => import("@/lib/course/design"));
const loadReview = once(() => import("@/lib/course/review"));
const loadSandboxVerify = once(() => import("@/lib/course/sandbox-verify"));
const loadSandbox = once(() => import("@/lib/sandbox"));
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
  const { generationOrder } = await loadGenerate();
  return generationOrder(context.spec, context.outline.data);
}

// One model call plans every pending Lesson's Source lookup. Empty when
// Grounding is off or nothing is pending, so ungrounded Courses pay nothing.
export async function stepPlanSources(
  context: GenerationContext,
  lessons: { id: string; title: string; summary: string }[],
): Promise<{ lessonId: string; query: string }[]> {
  "use step";
  const { planLessonSources } = await loadGenerate();
  const { generationModel } = await loadModel();

  const performanceOf = new Map(context.spec.alignment.map((a) => [a.lessonId, a.performance]));
  const plans = await planLessonSources(
    generationModel(),
    context.course,
    lessons.map((l) => ({ ...l, performance: performanceOf.get(l.id) })),
    context.sources,
  );
  return plans.flatMap((p) => (p.needsSource && p.query ? [{ lessonId: p.lessonId, query: p.query }] : []));
}

export async function stepFetchSource(
  courseId: string,
  query: string,
): Promise<PromptSource | null> {
  "use step";
  const { db } = await loadDb();
  const { LESSON_SOURCE_LIMIT } = await loadGenerate();
  const { saveLessonSource } = await loadDbLessons();
  const { firecrawlSearcher } = await loadDesign();

  const pages = await firecrawlSearcher()(query, LESSON_SOURCE_LIMIT);
  const page = pages[0];
  if (!page || page.content.trim().length === 0) return null;
  const excerpt = page.content.slice(0, 600).trim();
  const ref = await saveLessonSource(db, courseId, {
    title: page.title,
    url: page.url,
    excerpt,
  });
  return { ref, title: page.title, url: page.url, excerpt };
}

export async function stepGenerateLesson(
  context: GenerationContext,
  runId: string,
  lesson: OutlineLesson,
  nextLesson: OutlineLesson | null,
  priorLessons: { title: string; summary: string }[],
  sources: PromptSource[],
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { generateLesson } = await loadGenerate();
  const { saveLessonContent } = await loadDbLessons();
  const { generationModel } = await loadModel();

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
  });
}

export async function stepFactualReview(
  courseId: string,
  outlineVersion: number,
  onlyLessonRefs?: string[],
): Promise<ReviewFindingPayload[]> {
  "use step";
  const { db } = await loadDb();
  const { factualFindings } = await loadReview();
  const { generationModel } = await loadModel();
  const { loadGenerationContext, getLessonContentsForVersion } = await loadDbLessons();

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const lessonContents = await getLessonContentsForVersion(db, courseId, outlineVersion);
  const scope =
    onlyLessonRefs && onlyLessonRefs.length > 0
      ? lessonContents.filter((l) => onlyLessonRefs.includes(l.lessonId))
      : lessonContents;
  return factualFindings(
    generationModel(),
    {
      topic: context.course.topic,
      goal: context.course.goal,
      language: context.course.language,
    },
    context.spec,
    context.sources,
    scope,
  );
}

export async function stepDesignReview(
  courseId: string,
  outlineVersion: number,
  onlyLessonRefs?: string[],
): Promise<ReviewFindingPayload[]> {
  "use step";
  const { db } = await loadDb();
  const { designFindings } = await loadReview();
  const { generationModel } = await loadModel();
  const { loadGenerationContext, getLessonContentsForVersion } = await loadDbLessons();

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const lessonContents = await getLessonContentsForVersion(db, courseId, outlineVersion);
  const scope =
    onlyLessonRefs && onlyLessonRefs.length > 0
      ? lessonContents.filter((l) => onlyLessonRefs.includes(l.lessonId))
      : lessonContents;
  return designFindings(
    generationModel(),
    {
      topic: context.course.topic,
      goal: context.course.goal,
      language: context.course.language,
    },
    context.spec,
    context.outline.data,
    scope,
  );
}

export async function stepCodeVerification(
  courseId: string,
  outlineVersion: number,
  round: number,
  onlyLessonRefs?: string[],
): Promise<ReviewFindingPayload[]> {
  "use step";
  const { db } = await loadDb();
  const { needsCodeVerification, planVerification, runVerification, verificationFindings } =
    await loadSandboxVerify();
  const { vercelSandboxProvider } = await loadSandbox();
  const { generationModel } = await loadModel();
  const { loadGenerationContext, getLessonContentsForVersion } = await loadDbLessons();
  const { saveCodeVerification, findCodeVerification } = await loadDbReview();

  const context = (await loadGenerationContext(db, courseId, outlineVersion))!;
  const lessonContents = await getLessonContentsForVersion(db, courseId, outlineVersion);
  const scope =
    onlyLessonRefs && onlyLessonRefs.length > 0
      ? lessonContents.filter((l) => onlyLessonRefs.includes(l.lessonId))
      : lessonContents;

  // Reuse the recorded Sandbox pass so a retry does not re-run it.
  if (!needsCodeVerification(context.course, scope)) return [];
  const existing = await findCodeVerification(db, courseId, outlineVersion, round);
  if (existing) {
    const evidence = existing.evidence as {
      commands?: {
        run: string;
        lessonRef: string;
        exitCode: number;
        stderr: string;
        proves?: string;
      }[];
    };
    return (evidence.commands ?? [])
      .filter((c) => c.exitCode !== 0)
      .map((c) => ({
        kind: "code-execution" as const,
        lessonRef: c.lessonRef,
        detail: `The command "${c.run}" exited with code ${c.exitCode}${
          c.stderr ? `: ${c.stderr.trim().slice(0, 300)}` : ""
        }. It was meant to prove: ${c.proves ?? "the Lesson's claim"}`,
        correction: `Fix the Lesson's code so that "${c.run}" runs cleanly.`,
      }));
  }

  const model = generationModel();
  const plan = await planVerification(model, context.course, context.spec, scope);
  const result = await runVerification(vercelSandboxProvider(), plan);
  await saveCodeVerification(db, courseId, outlineVersion, round, result);
  return verificationFindings(result).map((f) => ({
    kind: "code-execution" as const,
    lessonRef: f.lessonRef,
    detail: f.detail,
    correction: f.correction,
  }));
}

export async function stepSaveReviewFindings(
  reviewRunId: string,
  courseId: string,
  outlineVersion: number,
  round: number,
  findings: ReviewFindingPayload[],
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { saveFindings, recordReviewStep } = await loadDbReview();
  await recordReviewStep(db, reviewRunId, round);
  await saveFindings(db, reviewRunId, courseId, outlineVersion, round, findings);
}

// The four review slices are independent: structure, facts, design, and the
// Sandbox lane read the same candidate and never each other's output.
export async function runReviewRound(
  courseId: string,
  outlineVersion: number,
  reviewRunId: string,
  round: number,
  onlyLessonRefs?: string[],
): Promise<ReviewFindingPayload[]> {
  const [structural, factual, design, code] = await Promise.all([
    stepStructuralReview(courseId, outlineVersion),
    stepFactualReview(courseId, outlineVersion, onlyLessonRefs),
    stepDesignReview(courseId, outlineVersion, onlyLessonRefs),
    stepCodeVerification(courseId, outlineVersion, round, onlyLessonRefs),
  ]);
  const findings = [...structural, ...factual, ...design, ...code];
  await stepSaveReviewFindings(reviewRunId, courseId, outlineVersion, round, findings);
  return findings;
}

export async function stepCorrectLesson(
  courseId: string,
  outlineVersion: number,
  runId: string,
  lessonRef: string,
  findings: ReviewFindingPayload[],
): Promise<void> {
  "use step";
  const { db } = await loadDb();
  const { correctLesson } = await loadReview();
  const { generationModel } = await loadModel();
  const { loadGenerationContext, getLessonContentsForVersion, saveLessonContent } =
    await loadDbLessons();

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
  await saveLessonContent(db, courseId, outlineVersion, runId, corrected, { touchRun: false });
}

function summaryOfBlock(block: unknown): string {
  const b = block as { text?: string };
  return b.text ?? "";
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
  await failReview(db, courseId, reviewRunId, message, touchCourse ? undefined : { touchCourse: false });
}

export async function stepPublish(
  courseId: string,
  outlineVersion: number,
  reviewRunId: string,
): Promise<{ ok: boolean; reason?: string; revisionNumber?: number }> {
  "use step";
  const { publishRevision } = await loadDbReview();
  const { db } = await loadDb();
  const result = await publishRevision(db, courseId, outlineVersion, reviewRunId);
  return result.ok
    ? { ok: true, revisionNumber: result.revision.revisionNumber }
    : { ok: false, reason: result.reason };
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
