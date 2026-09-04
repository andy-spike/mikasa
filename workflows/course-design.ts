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
  runId: string,
  reuse: boolean,
): Promise<GatheredSource[]> {
  "use step";
  const { db } = await import("@/lib/db");
  const { gatherSources, selectExcerpts, firecrawlSearcher, EXCERPT_MAX_CHARS } =
    await import("@/lib/course/design");
  const { groundingModel } = await import("@/lib/model");
  const { appendDesignEvent, listCourseSources, upsertDesignSources } =
    await import("@/lib/db/design");
  const { nanoid } = await import("nanoid");

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

  {
    const { sources } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(sources).where(eq(sources.courseId, courseId));
  }

  if (!course.grounding) {
    await appendDesignEvent(
      db,
      courseId,
      runId,
      "sources-ready",
      "Grounding is off, so this Course is planned from the model's own knowledge.",
      { count: 0 },
    );
    return [];
  }

  await appendDesignEvent(
    db,
    courseId,
    runId,
    "sources-searching",
    "Searching for current sources on your Topic and Goal.",
  );
  const pages = await gatherSources(firecrawlSearcher(), course);
  if (pages.length === 0) {
    await appendDesignEvent(
      db,
      courseId,
      runId,
      "sources-ready",
      "The search came back empty, so this Course is planned without extra sources.",
      { count: 0 },
    );
    return [];
  }

  const refs = new Map(pages.map((p) => [p.url, `src-${nanoid(10)}`]));
  const placeholder: GatheredSource[] = pages.map((p) => ({
    ref: refs.get(p.url) ?? `src-${nanoid(10)}`,
    title: p.title,
    url: p.url,
    fetchedAt: p.fetchedAt,
    excerpt: p.content.slice(0, EXCERPT_MAX_CHARS).trim(),
  }));
  await upsertDesignSources(db, courseId, placeholder);
  await appendDesignEvent(
    db,
    courseId,
    runId,
    "sources-found",
    `Found ${pages.length} ${pages.length === 1 ? "source" : "sources"}. Reading the passages that matter for your Goal.`,
    {
      count: pages.length,
      sources: placeholder.map((s) => ({ ref: s.ref, title: s.title, url: s.url })),
    },
  );

  const excerpts = await selectExcerpts(groundingModel(), course, pages);
  const gathered: GatheredSource[] = pages.map((p) => ({
    ref: refs.get(p.url) ?? `src-${nanoid(10)}`,
    title: p.title,
    url: p.url,
    fetchedAt: p.fetchedAt,
    excerpt: excerpts.get(p.url) ?? p.content.slice(0, EXCERPT_MAX_CHARS).trim(),
  }));
  await upsertDesignSources(db, courseId, gathered);
  await appendDesignEvent(
    db,
    courseId,
    runId,
    "sources-ready",
    `Kept ${gathered.length} ${gathered.length === 1 ? "source" : "sources"} for the Outline.`,
    {
      count: gathered.length,
      sources: gathered.map((s) => ({ ref: s.ref, title: s.title, url: s.url })),
    },
  );
  return gathered;
}

async function stepDesignOutline(
  course: DesignCourse,
  courseId: string,
  runId: string,
  sources: GatheredSource[],
  reuse: boolean,
): Promise<{ outline: OutlineData; draft: OutlineDraft; outlineVersion: number }> {
  "use step";
  const { db } = await import("@/lib/db");
  const { draftOutline, buildOutline } = await import("@/lib/course/design");
  const { designModel } = await import("@/lib/model");
  const { appendDesignEvent, latestOutline, saveDesignOutline } = await import("@/lib/db/design");

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

  await appendDesignEvent(
    db,
    courseId,
    runId,
    "outline-drafting",
    "Drafting the Modules and the Lesson titles from your Goal.",
  );
  const draft = await draftOutline(designModel(), course, sources);
  const outline = buildOutline(draft, course.depth);
  const saved = await saveDesignOutline(db, courseId, outline, draft);
  const lessonCount = outline.modules.reduce((n, m) => n + m.lessons.length, 0);
  await appendDesignEvent(
    db,
    courseId,
    runId,
    "outline-ready",
    `Drafted ${outline.modules.length} Modules with ${lessonCount} Lessons. Planning how they connect.`,
    {
      modules: outline.modules.map((m) => ({
        numeral: m.numeral,
        title: m.title,
        lessons: m.lessons.map((l) => ({ title: l.title, summary: l.summary, minutes: l.minutes })),
      })),
      terminalPerformances: draft.terminalPerformances,
      throughline: draft.throughline,
      exclusions: draft.exclusions,
      learnerAssumptions: draft.learnerAssumptions,
    },
  );
  return { outline, draft, outlineVersion: saved.version };
}

async function stepDesignSpecification(
  course: DesignCourse,
  courseId: string,
  runId: string,
  outline: OutlineData,
  draft: OutlineDraft,
  sources: GatheredSource[],
): Promise<CourseSpecification> {
  "use step";
  const { designSpecification } = await import("@/lib/course/design");
  const { designModel } = await import("@/lib/model");
  const { appendDesignEvent } = await import("@/lib/db/design");
  const { db } = await import("@/lib/db");

  await appendDesignEvent(
    db,
    courseId,
    runId,
    "specification-working",
    "Linking each Lesson to the Goal and the final exercise.",
  );
  const specification = await designSpecification(designModel(), course, outline, draft, sources);
  await appendDesignEvent(
    db,
    courseId,
    runId,
    "specification-ready",
    "The Lesson connections are set. Saving the Outline for your review.",
  );
  return specification;
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

async function stepDesignCancelled(courseId: string): Promise<boolean> {
  "use step";
  const { designCourseExists } = await import("@/lib/db/design");
  const { db } = await import("@/lib/db");
  return !(await designCourseExists(db, courseId));
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
    const sources = await stepDesignSources(loaded.course, courseId, runId, !reached("sources"));
    if (await stepDesignCancelled(courseId)) return { ok: false as const, reason: "cancelled" };

    await stepMarkStep(runId, "outline");
    const built = await stepDesignOutline(
      loaded.course,
      courseId,
      runId,
      sources,
      !reached("outline"),
    );
    if (await stepDesignCancelled(courseId)) return { ok: false as const, reason: "cancelled" };

    await stepMarkStep(runId, "specification");
    const specification = await stepDesignSpecification(
      loaded.course,
      courseId,
      runId,
      built.outline,
      built.draft,
      sources,
    );
    if (await stepDesignCancelled(courseId)) return { ok: false as const, reason: "cancelled" };

    await stepMarkStep(runId, "persist");
    await stepPersist(
      courseId,
      runId,
      { outline: built.outline, specification, sources },
      built.outlineVersion,
    );
    return { ok: true as const };
  } catch (error) {
    if (await stepDesignCancelled(courseId)) return { ok: false as const, reason: "cancelled" };
    await stepFail(courseId, runId, errorMessage(error));
    return { ok: false as const, reason: "design-failed" };
  }
}
