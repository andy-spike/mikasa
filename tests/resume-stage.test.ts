import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { ChangePlanOp } from "@/lib/course/change-plan";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

vi.mock("next/headers", async () => {
  const { headerState } = await import("./helpers/request-context");
  return { headers: async () => headerState.current };
});

const navigation = vi.hoisted(() => ({
  redirect: (url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/navigation", () => navigation);

vi.mock("workflow/api", () => ({
  start: async () => ({ runId: "wrun_test" }),
}));

const reviewState = vi.hoisted(() => ({
  throwFactual: false,
}));
vi.mock("@/lib/course/review", () => ({
  structuralFindings: () => [],
  combinedFindings: async () => {
    if (reviewState.throwFactual) throw new Error("The review exploded.");
    return [];
  },
  dedupeCorrectionQueries: () => [],
  correctLesson: vi.fn(),
  MAX_CORRECTION_ROUNDS: 3,
  lessonContextExcerpt: () => "",
  CORRECTION_SOURCE_QUERY_CAP: 3,
}));

const publishRefusal = vi.hoisted(() => ({
  current: null as null | { ok: false; reason: string },
}));
vi.mock("@/lib/db/review", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/review")>();
  return {
    ...actual,
    publishRevision: async (...args: Parameters<typeof actual.publishRevision>) =>
      publishRefusal.current ?? actual.publishRevision(...args),
  };
});

const modelState = vi.hoisted(() => ({
  current: undefined as ReturnType<typeof import("./helpers/fake-model").scriptedModel> | undefined,
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    generationModel: () => modelState.current!.model,
    embedTexts: async (texts: string[]) => texts.map(() => new Array<number>(1536).fill(0.01)),
  };
});

const { json, scriptedModel } = await import("./helpers/fake-model");
const { db } = await import("@/lib/db");
const { changePlans, courseSpecs, courses, generationRuns, lessons, outlines, reviewRuns, users } =
  await import("@/lib/db/schema");
const { currentRevision } = await import("@/lib/db/review");
const { stagePlanRevision, resumeStagedRevision } = await import("@/lib/db/tailor");
const { retryCourseAction } = await import("@/lib/actions/courses");
const { generateCourseWorkflow } = await import("@/workflows/course-generation");
const { stageRevisionWorkflow } = await import("@/workflows/course-revision");
const { signInWithGoogle } = await import("./helpers/auth");
const { setRequestCookie } = await import("./helpers/request-context");
const { makeOutline, makeSpec } = await import("./helpers/fixtures");
const {
  OWNER,
  seedPublishedCourse,
  proposeAndAccept: acceptPlan,
  userIdOf,
} = await import("./helpers/published-course");

const OUTLINE = makeOutline([2, 1]);
const SPEC = makeSpec(OUTLINE, {
  topic: "Watercolor washes",
  goal: "Paint a clean wash",
  terminalPerformances: ["Paint a wash"],
  throughline: { premise: "Water first", runningExample: "The sky wash", vocabulary: [] },
  finalExercise: { task: "Paint it", acceptanceChecks: ["It holds"] },
});

function lessonBodyText(title: string): string {
  return `Repainted: **${title}** works now.`;
}

function lessonJson(title: string): string {
  return json({
    body: [
      { kind: "p", text: lessonBodyText(title) },
      { kind: "p", text: "Apply the idea." },
      { kind: "p", text: "Check the result." },
    ],
    workedExample: [{ kind: "p", text: "The sky wash, again." }],
    recallPrompt: `What does ${title} do?`,
    selfExplanationPrompt: "Why this order?",
    exercise: { task: `Do ${title}.`, check: "It runs." },
    bridge: "Next.",
  });
}

function reconcileJson(outline: { modules: { lessons: { id: string }[] }[] }): string {
  return json({
    learningGraph: [],
    alignment: outline.modules
      .flatMap((m) => m.lessons)
      .map((l) => ({
        lessonId: l.id,
        performance: `does ${l.id}`,
        prerequisiteNodes: [],
        moduleMilestone: "m",
        exerciseContribution: "c",
        exampleStart: "",
        exampleEnd: "",
        sourceRefs: [],
      })),
  });
}

let ownerCookie = "";

beforeEach(async () => {
  setRequestCookie(null);
  ownerCookie = await signInWithGoogle(OWNER);
  reviewState.throwFactual = false;
  publishRefusal.current = null;
});

afterEach(async () => {
  await db.delete(users);
  setRequestCookie(null);
});

function seedCourse(ownerEmail: string): Promise<string> {
  return seedPublishedCourse({
    ownerEmail,
    outline: OUTLINE,
    spec: SPEC,
    grounding: false,
    allModules: true,
  });
}

async function seedGeneratingCourse(
  ownerEmail: string,
): Promise<{ courseId: string; runId: string }> {
  const [user] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "Watercolor washes",
      goal: "Paint a clean wash",
      depth: "reach",
      grounding: false,
      status: "generating",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  const [run] = await db
    .insert(generationRuns)
    .values({ courseId: course.id, outlineVersion: 1 })
    .returning();
  return { courseId: course.id, runId: run.id };
}

function proposeAndAccept(courseId: string, ops: ChangePlanOp[]): Promise<string> {
  return acceptPlan(courseId, ops, OWNER, ownerCookie);
}

async function stageForReal(courseId: string, planId: string) {
  const staged = await stagePlanRevision(db, await userIdOf(OWNER), courseId, planId);
  expect(staged.ok).toBe(true);
  return staged as {
    ok: true;
    runId: string;
    baseRevisionNumber: number;
    stagedOutlineVersion: number;
    regenerateLessonRefs: string[];
    embedLessonRefs: string[];
  };
}

async function runRow(courseId: string, outlineVersion: number) {
  const [run] = await db
    .select()
    .from(generationRuns)
    .where(
      and(eq(generationRuns.courseId, courseId), eq(generationRuns.outlineVersion, outlineVersion)),
    );
  return run;
}

describe("a generation whose review fails", () => {
  it("retry keeps the written Lessons and opens review again", async () => {
    const { courseId, runId } = await seedGeneratingCourse(OWNER);
    reviewState.throwFactual = true;
    modelState.current = scriptedModel([
      lessonJson("Lesson one"),
      lessonJson("Lesson two"),
      lessonJson("Lesson three"),
    ]);

    const first = await generateCourseWorkflow(courseId, runId, 1);
    expect(first).toMatchObject({ ok: false, reason: "generation-failed" });

    const [failedRun] = await db.select().from(generationRuns).where(eq(generationRuns.id, runId));
    expect(failedRun.status).toBe("failed");
    const [failedCourse] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(failedCourse.status).toBe("failed");

    reviewState.throwFactual = false;
    setRequestCookie(ownerCookie);
    expect(await retryCourseAction(courseId)).toMatchObject({ ok: true });
    const [reopened] = await db.select().from(generationRuns).where(eq(generationRuns.id, runId));
    expect(reopened.status).toBe("running");

    modelState.current = scriptedModel([
      json({ body: [{ kind: "p", text: "REGENERATED" }], exercise: { task: "x", check: "y" } }),
    ]);
    const retry = await generateCourseWorkflow(courseId, runId, 1);
    expect(retry).toMatchObject({ ok: true, revisionNumber: 1 });

    const bodies = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, 1)));
    expect(bodies.map((r) => r.lessonRef).sort()).toEqual(["l1", "l2", "l3"]);
    expect(JSON.stringify(bodies.map((r) => r.body))).not.toContain("REGENERATED");

    const reviews = await db.select().from(reviewRuns).where(eq(reviewRuns.courseId, courseId));
    expect(reviews).toHaveLength(2);
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(1);
  });
});

describe("a staged revision whose review fails", () => {
  it("retry skips the written Lessons and the reconciliation, and the Course stays ready", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    const staged = await stageForReal(courseId, planId);

    reviewState.throwFactual = true;
    modelState.current = scriptedModel([reconcileJson(OUTLINE), lessonJson("Lesson one")]);
    const first = await stageRevisionWorkflow(
      courseId,
      planId,
      staged.runId,
      staged.stagedOutlineVersion,
      staged.baseRevisionNumber,
      staged.regenerateLessonRefs,
      staged.embedLessonRefs,
    );
    expect(first).toMatchObject({ ok: false, reason: "revision-failed" });

    const [failedRun] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, staged.runId));
    expect(failedRun.status).toBe("failed");
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");
    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("staged");

    /* The retry: no reconciliation model call (the spec the Lessons were
       written against stands), no lesson rewrite, review re-opened. */
    reviewState.throwFactual = false;
    const resume = await resumeStagedRevision(db, await userIdOf(OWNER), courseId, planId);
    expect(resume.ok).toBe(true);
    const resumeStaged = resume as {
      ok: true;
      runId: string;
      baseRevisionNumber: number;
      stagedOutlineVersion: number;
      regenerateLessonRefs: string[];
      embedLessonRefs: string[];
    };
    modelState.current = scriptedModel([
      json({ body: [{ kind: "p", text: "REGENERATED" }], exercise: { task: "x", check: "y" } }),
    ]);
    const retry = await stageRevisionWorkflow(
      courseId,
      planId,
      resumeStaged.runId,
      resumeStaged.stagedOutlineVersion,
      resumeStaged.baseRevisionNumber,
      resumeStaged.regenerateLessonRefs,
      resumeStaged.embedLessonRefs,
    );
    expect(retry).toMatchObject({ ok: true, revisionNumber: 2 });

    const bodies = await db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.courseId, courseId),
          eq(lessons.outlineVersion, resumeStaged.stagedOutlineVersion),
        ),
      );
    const l1 = bodies.find((r) => r.lessonRef === "l1")!;
    expect(JSON.stringify(l1.body)).toContain(lessonBodyText("Lesson one"));
    expect(JSON.stringify(bodies.map((r) => r.body))).not.toContain("REGENERATED");

    const [courseAfter] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(courseAfter.status).toBe("ready");
    const [planAfter] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(planAfter.status).toBe("published");
  });
});

describe("a staged revision whose publication fails", () => {
  it("the passed review stands, and a retry publishes without any review call", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    const staged = await stageForReal(courseId, planId);

    reviewState.throwFactual = false;
    modelState.current = scriptedModel([reconcileJson(OUTLINE), lessonJson("Lesson one")]);
    publishRefusal.current = { ok: false, reason: "The store refused." };

    const first = await stageRevisionWorkflow(
      courseId,
      planId,
      staged.runId,
      staged.stagedOutlineVersion,
      staged.baseRevisionNumber,
      staged.regenerateLessonRefs,
      staged.embedLessonRefs,
    );
    expect(first).toMatchObject({ ok: false, reason: "publish-failed" });

    const reviews = await db
      .select()
      .from(reviewRuns)
      .where(
        and(
          eq(reviewRuns.courseId, courseId),
          eq(reviewRuns.outlineVersion, staged.stagedOutlineVersion),
        ),
      );
    expect(reviews).toHaveLength(1);
    expect(reviews[0].status).toBe("succeeded");

    const failedRun = await runRow(courseId, staged.stagedOutlineVersion);
    expect(failedRun.status).toBe("failed");
    expect(failedRun.currentStep).toBe("publish");
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");

    /* The retry publishes from the standing review: no model call at
       all — no reconciliation, no Lessons, no review. */
    publishRefusal.current = null;
    const resume = await resumeStagedRevision(db, await userIdOf(OWNER), courseId, planId);
    expect(resume.ok).toBe(true);
    const resumeStaged = resume as {
      ok: true;
      runId: string;
      baseRevisionNumber: number;
      stagedOutlineVersion: number;
      regenerateLessonRefs: string[];
      embedLessonRefs: string[];
    };
    modelState.current = scriptedModel([json({ unexpected: true })]);
    const retry = await stageRevisionWorkflow(
      courseId,
      planId,
      resumeStaged.runId,
      resumeStaged.stagedOutlineVersion,
      resumeStaged.baseRevisionNumber,
      resumeStaged.regenerateLessonRefs,
      resumeStaged.embedLessonRefs,
    );
    expect(retry).toMatchObject({ ok: true, revisionNumber: 2 });
    expect(modelState.current!.calls()).toBe(0);

    const reviewsAfter = await db
      .select()
      .from(reviewRuns)
      .where(
        and(
          eq(reviewRuns.courseId, courseId),
          eq(reviewRuns.outlineVersion, staged.stagedOutlineVersion),
        ),
      );
    expect(reviewsAfter).toHaveLength(1);
    const [courseAfter] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(courseAfter.status).toBe("ready");
    const [planAfter] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(planAfter.status).toBe("published");
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(2);
  });
});
