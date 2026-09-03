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
 *
 * Resume (ticket #7): `resumeFrom` names the first step a retry must
 * actually run. Work the failed run already persisted — Sources, Outline
 * and its draft — is reused from the database instead of regenerated.
 */
import type { DesignCourse, OutlineDraft } from "@/lib/course/design";
import type {
  CourseSpecification,
  DesignOutcome,
  GatheredSource,
  OutlineData,
} from "@/lib/course/types";

/** The steps a design runs, in order. */
export type DesignStep = "sources" | "outline" | "specification" | "persist";

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

/**
 * Sources only exist when Grounding is on; the lib function is the guard.
 * A resume past this step loads the persisted Sources instead.
 */
async function stepDesignSources(
  course: DesignCourse,
  courseId: string,
  reuse: boolean,
): Promise<GatheredSource[]> {
  "use step";
  const { db } = await import("@/lib/db");
  const { collectSources, firecrawlSearcher } = await import("@/lib/course/design");
  const { groundingModel } = await import("@/lib/model");
  const { listCourseSources } = await import("@/lib/db/design");

  if (reuse) {
    const rows = await listCourseSources(db, courseId);
    return rows.map((r) => ({
      ref: r.ref,
      title: r.title,
      url: r.url,
      fetchedAt: r.fetchedAt.toISOString(),
      excerpt: r.excerpt,
    }));
  }

  const sources = await collectSources(firecrawlSearcher(), groundingModel(), course);
  const { saveDesignSources } = await import("@/lib/db/design");
  await saveDesignSources(db, courseId, sources);
  return sources;
}

/**
 * Drafts and bounds-checks the Outline in one step: a draft outside the
 * Depth bounds fails the step, which the engine retries — effectively a
 * fresh sample — before the run is allowed to fail for good. A resume
 * past this step loads the persisted Outline and its draft instead; if
 * the persisted Outline carries no draft (nothing to build a
 * specification from), the step drafts fresh rather than generating a
 * hollow specification.
 */
async function stepDesignOutline(
  course: DesignCourse,
  courseId: string,
  sources: GatheredSource[],
  reuse: boolean,
): Promise<{ outline: OutlineData; draft: OutlineDraft; outlineVersion: number }> {
  "use step";
  const { db } = await import("@/lib/db");
  const { draftOutline, buildOutline } = await import("@/lib/course/design");
  const { designModel } = await import("@/lib/model");
  const { latestOutline, saveDesignOutline } = await import("@/lib/db/design");

  if (reuse) {
    const existing = await latestOutline(db, courseId);
    if (existing && existing.draft) {
      return {
        outline: existing.data,
        draft: existing.draft,
        outlineVersion: existing.version,
      };
    }
    /* Nothing usable persisted: fall through and draft. */
  }

  const draft = await draftOutline(designModel(), course, sources);
  const outline = buildOutline(draft, course.depth);
  const saved = await saveDesignOutline(db, courseId, outline, draft);
  return { outline, draft, outlineVersion: saved.version };
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

/** Persists the specification and flips the Course to Outline-ready. */
async function stepPersist(
  courseId: string,
  runId: string,
  outcome: DesignOutcome,
  outlineVersion: number,
): Promise<void> {
  "use step";
  const { db } = await import("@/lib/db");
  const { saveDesignSpecification, completeDesignRun } = await import("@/lib/db/design");
  await saveDesignSpecification(db, courseId, outcome.specification, outlineVersion);
  await completeDesignRun(db, courseId, runId);
}

/** Records the failure so the Course stays retryable-looking (ticket #7). */
async function stepFail(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failDesignRun } = await import("@/lib/db/design");
  const { db } = await import("@/lib/db");
  await failDesignRun(db, courseId, runId, message);
}

/**
 * One design pass: Sources (when Grounding is on) → Outline → private
 * specification → persist. `resumeFrom` starts the pass at a later step,
 * reusing what the failed run already persisted. A step that exhausts its
 * retries fails the run; the Course records the failure and waits for
 * retry.
 */
export async function designCourseWorkflow(
  courseId: string,
  runId: string,
  resumeFrom: DesignStep = "sources",
) {
  "use workflow";

  const loaded = await stepLoadCourse(courseId);
  if (!loaded) {
    await stepFail(courseId, runId, "The Course to design no longer exists.");
    return { ok: false as const, reason: "course-not-found" };
  }

  const order: DesignStep[] = ["sources", "outline", "specification", "persist"];
  const reached = (step: DesignStep) => order.indexOf(step) >= order.indexOf(resumeFrom);

  try {
    /* A resume past a step reuses what the failed run persisted; a fresh
       run (or a resume to its first unfinished step) runs the step. */
    await stepMarkStep(runId, "sources");
    const sources = await stepDesignSources(loaded.course, courseId, !reached("sources"));

    await stepMarkStep(runId, "outline");
    const built = await stepDesignOutline(loaded.course, courseId, sources, !reached("outline"));

    await stepMarkStep(runId, "specification");
    const specification = await stepDesignSpecification(
      loaded.course,
      built.outline,
      built.draft,
      sources,
    );

    await stepMarkStep(runId, "persist");
    await stepPersist(
      courseId,
      runId,
      { outline: built.outline, specification, sources },
      built.outlineVersion,
    );
    return { ok: true as const };
  } catch (error) {
    await stepFail(courseId, runId, errorMessage(error));
    return { ok: false as const, reason: "design-failed" };
  }
}
