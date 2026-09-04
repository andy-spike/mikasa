// Step args cross process boundaries as JSON, so providers resolve inside each step.
import type { DesignCourse, OutlineDraft } from "@/lib/course/design";
import type {
  CourseSpecification,
  DesignOutcome,
  GatheredSource,
  OutlineData,
} from "@/lib/course/types";

export type DesignStep = "sources" | "outline" | "specification" | "persist";

type Loaded = { course: DesignCourse };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "Course design failed.";
}

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

async function stepFail(courseId: string, runId: string, message: string): Promise<void> {
  "use step";
  const { failDesignRun } = await import("@/lib/db/design");
  const { db } = await import("@/lib/db");
  await failDesignRun(db, courseId, runId, message);
}

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
