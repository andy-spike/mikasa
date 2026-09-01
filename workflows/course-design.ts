/**
 * Durable Course design (ADR 0005). The Learner can leave and return while
 * this runs: every meaningful fact — which step, what failed, what the
 * Outline looks like — lands in Postgres through `lib/db/design`, and the
 * engine resumpts the run from there on Vercel.
 *
 * This file owns only the Workflow shape: directives, step boundaries,
 * error containment. Everything substantive happens in `lib/course/design`
 * (plain functions, injected providers — the tests exercise those directly)
 * and `lib/db/design` (state). Steps stay thin so the Workflow wrapper
 * would survive an engine swap.
 *
 * Arguments and return values of every step are JSON-only (Workflow ships
 * them across process boundaries); that is why providers are resolved
 * inside each step rather than injected from the workflow body.
 */
import type { DesignCourse, OutlineDraft } from "@/lib/course/design";
import type {
  CourseSpecification,
  DesignOutcome,
  GatheredSource,
  OutlineData,
} from "@/lib/course/types";

/** What the workflow body needs before any step runs. */
type Loaded = { course: DesignCourse };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "Course design failed.";
}

/** Reads the Course and its design input. A missing id ends the run. */
async function stepLoadCourse(courseId: string): Promise<Loaded | null> {
  "use step";
  const { findCourseForDesign } = await import("@/lib/db/design");
  const { db } = await import("@/lib/db");
  const course = await findCourseForDesign(db, courseId);
  if (!course) return null;
  return {
    course: {
      topic: course.topic,
      goal: course.goal,
      background: course.background,
      language: course.language,
      depth: course.depth,
      grounding: course.grounding,
    },
  };
}

async function stepMarkStep(runId: string, step: string): Promise<void> {
  "use step";
  const { recordDesignStep } = await import("@/lib/db/design");
  const { db } = await import("@/lib/db");
  await recordDesignStep(db, runId, step);
}

/** Sources only exist when Grounding is on; the lib function is the guard. */
async function stepDesignSources(course: DesignCourse): Promise<GatheredSource[]> {
  "use step";
  const { collectSources, firecrawlSearcher } = await import("@/lib/course/design");
  const { groundingModel } = await import("@/lib/model");
  return collectSources(firecrawlSearcher(), groundingModel(), course);
}

/**
 * Drafts and bounds-checks the Outline in one step: a draft outside the
 * Depth bounds fails the step, which the engine retries — effectively a
 * fresh sample — before the run is allowed to fail for good.
 */
async function stepDesignOutline(
  course: DesignCourse,
  sources: GatheredSource[],
): Promise<{ outline: OutlineData; draft: OutlineDraft }> {
  "use step";
  const { draftOutline, buildOutline } = await import("@/lib/course/design");
  const { designModel } = await import("@/lib/model");
  const draft = await draftOutline(designModel(), course, sources);
  return { outline: buildOutline(draft, course.depth), draft };
}

async function stepDesignSpecification(
  course: DesignCourse,
  outline: OutlineData,
  draft: OutlineDraft,
  sources: GatheredSource[],
): Promise<CourseSpecification> {
  "use step";
  const { designSpecification } = await import("@/lib/course/design");
  const { designModel } = await import("@/lib/model");
  return designSpecification(designModel(), course, outline, draft, sources);
}

/** Lands the whole outcome in Postgres and flips the Course to Outline-ready. */
async function stepPersist(
  courseId: string,
  runId: string,
  outcome: DesignOutcome,
): Promise<void> {
  "use step";
  const { saveDesignResult } = await import("@/lib/db/design");
  const { db } = await import("@/lib/db");
  await saveDesignResult(db, courseId, runId, outcome);
}

/** Records the failure so the Course stays retryable-looking (ticket #7). */
async function stepFail(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failDesignRun } = await import("@/lib/db/design");
  const { db } = await import("@/lib/db");
  await failDesignRun(db, courseId, runId, message);
}

/**
 * One full design pass: Sources (when Grounding is on) → Outline → private
 * specification → persist. A step that exhausts its retries fails the run;
 * the Course records the failure and waits for retry.
 */
export async function designCourseWorkflow(courseId: string, runId: string) {
  "use workflow";

  const loaded = await stepLoadCourse(courseId);
  if (!loaded) {
    await stepFail(courseId, runId, "The Course to design no longer exists.");
    return { ok: false as const, reason: "course-not-found" };
  }

  try {
    const sources = await stepDesignSources(loaded.course);
    await stepMarkStep(runId, "outline");
    const { outline, draft } = await stepDesignOutline(loaded.course, sources);
    await stepMarkStep(runId, "specification");
    const specification = await stepDesignSpecification(
      loaded.course,
      outline,
      draft,
      sources,
    );
    await stepMarkStep(runId, "persist");
    await stepPersist(courseId, runId, { outline, specification, sources });
    return { ok: true as const };
  } catch (error) {
    await stepFail(courseId, runId, errorMessage(error));
    return { ok: false as const, reason: "design-failed" };
  }
}
