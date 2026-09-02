/**
 * Resuming at the exact failed stage (bug 2). Three rules, all about
 * never repeating finished work: a retry does not re-run reconciliation
 * it already got through (the written Lessons were generated against
 * that spec); a staged retry whose review already passed goes straight
 * to publication; and a publish failure fails the generation run only,
 * leaving the passed review standing so a retry re-publishes instead of
 * re-reviewing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { ChangePlanOp } from "@/lib/course/change-plan";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => headerState.current }));

const navigation = vi.hoisted(() => ({
  redirect: (url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/navigation", () => navigation);

vi.mock("workflow/api", () => ({
  start: async () => ({ runId: "wrun_test" }),
}));

/* The review's model-driven slices, per test: the factual slice can be
   made to throw (a review-stage failure) or pass. */
const reviewState = vi.hoisted(() => ({
  throwFactual: false,
}));
vi.mock("@/lib/course/review", () => ({
  structuralFindings: () => [],
  factualFindings: async () => {
    if (reviewState.throwFactual) throw new Error("The review exploded.");
    return [];
  },
  designFindings: async () => [],
  correctLesson: vi.fn(),
  MAX_CORRECTION_ROUNDS: 2,
}));

/* Publication is real unless a test installs a refusal. */
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

/* The generation model, scripted per attempt; the embedder is a fake. */
const modelState = vi.hoisted(() => ({
  current: undefined as ReturnType<
    typeof import("./helpers/fake-model").scriptedModel
  > | undefined,
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    generationModel: () => modelState.current!.model,
    embedTexts: async (texts: string[]) =>
      texts.map(() => new Array<number>(768).fill(0.01)),
  };
});

const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");
const { json, scriptedModel } = await import("./helpers/fake-model");
const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const {
  changePlans,
  courseSpecs,
  courses,
  generationRuns,
  lessons,
  outlines,
  reviewRuns,
  users,
} = await import("@/lib/db/schema");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { publishRevision, currentRevision } = await import("@/lib/db/review");
const { createChangePlan, stagePlanRevision, resumeStagedRevision } = await import(
  "@/lib/db/tailor"
);
const { reviewTailorOperationAction } = await import("@/lib/actions/tailor");
const { retryCourseAction } = await import("@/lib/actions/courses");
const { generateCourseWorkflow } = await import("@/workflows/course-generation");
const { stageRevisionWorkflow } = await import("@/workflows/course-revision");
const { parseLessonContent } = await import("@/lib/course/content");

const ORIGIN = "http://localhost:3000";

const OUTLINE = {
  modules: [
    {
      id: "m1",
      ordinal: 1,
      numeral: "I",
      title: "Module one",
      lessons: [
        { id: "l1", ordinal: 1, title: "Lesson one", summary: "First.", minutes: 20 },
        { id: "l2", ordinal: 2, title: "Lesson two", summary: "Second.", minutes: 20 },
      ],
    },
    {
      id: "m2",
      ordinal: 2,
      numeral: "II",
      title: "Module two",
      lessons: [
        { id: "l3", ordinal: 3, title: "Lesson three", summary: "Third.", minutes: 20 },
      ],
    },
  ],
};

const SPEC = {
  contract: {
    topic: "Watercolor washes",
    goal: "Paint a clean wash",
    background: "",
    depth: "reach",
    language: "en",
    terminalPerformances: ["Paint a wash"],
    exclusions: [],
    learnerAssumptions: [],
  },
  throughline: { premise: "Water first", runningExample: "The sky wash", vocabulary: [] },
  learningGraph: [],
  alignment: [
    { lessonId: "l1", performance: "does", prerequisiteNodes: [], moduleMilestone: "m", exerciseContribution: "c" },
    { lessonId: "l2", performance: "does", prerequisiteNodes: [], moduleMilestone: "m", exerciseContribution: "c" },
    { lessonId: "l3", performance: "does", prerequisiteNodes: [], moduleMilestone: "m", exerciseContribution: "c" },
  ],
  finalExercise: { task: "Paint it", acceptanceChecks: ["It holds"] },
  evidence: [],
};

function lessonBodyText(title: string): string {
  return `Repainted: **${title}** works now.`;
}

function lessonJson(title: string): string {
  return json({
    body: [{ kind: "p", text: lessonBodyText(title) }],
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
        performance: "does",
        prerequisiteNodes: [],
        moduleMilestone: "m",
        exerciseContribution: "c",
      })),
  });
}

async function signInWithGoogle(email: string): Promise<string> {
  fakeGoogle({ sub: `sub-${email}`, name: "A Learner", email, email_verified: true });
  const signIn = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/courses" }),
    }),
  );
  const { url } = (await signIn.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") as string;
  const callback = await auth.handler(
    new Request(`${ORIGIN}/api/auth/callback/google?code=one-time-code&state=${state}`, {
      headers: { cookie: cookieHeader(signIn) },
    }),
  );
  return cookieHeader(callback);
}

const OWNER = "owner@example.com";
let ownerCookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  ownerCookie = await signInWithGoogle(OWNER);
  reviewState.throwFactual = false;
  publishRefusal.current = null;
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

async function userIdOf(email: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user.id;
}

/** A Course at its generation checkpoint: Outline approved, nothing written. */
async function seedGeneratingCourse(ownerEmail: string): Promise<{ courseId: string; runId: string }> {
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

async function seedPublishedCourse(ownerEmail: string): Promise<string> {
  const { courseId, runId } = await seedGeneratingCourse(ownerEmail);
  for (const m of OUTLINE.modules) {
    for (const l of m.lessons) {
      await saveLessonContent(
        db,
        courseId,
        1,
        runId,
        parseLessonContent(l.id, l.title, {
          body: [{ kind: "p", text: `Lesson ${l.id} of the wash course.` }],
          workedExample: [{ kind: "p", text: "The sky wash, again." }],
          recallPrompt: "Recall it.",
          selfExplanationPrompt: "Explain it.",
          exercise: { task: "Paint one.", check: "It holds." },
          bridge: "Next.",
        }),
      );
    }
  }
  const [review] = await db
    .insert(reviewRuns)
    .values({ courseId, outlineVersion: 1, status: "succeeded" })
    .returning();
  const published = await publishRevision(db, courseId, 1, review.id);
  expect(published.ok).toBe(true);
  return courseId;
}

/** A plan with every operation accepted, as the pane's review leaves it. */
async function proposeAndAccept(courseId: string, ops: ChangePlanOp[]): Promise<string> {
  const created = await createChangePlan(db, await userIdOf(OWNER), courseId, ops);
  expect(created.ok).toBe(true);
  const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } })
    .plan;
  headerState.current = new Headers({ cookie: ownerCookie });
  for (const operation of plan.operations) {
    await reviewTailorOperationAction(plan.id, operation.id, "accepted");
  }
  return plan.id;
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
      and(
        eq(generationRuns.courseId, courseId),
        eq(generationRuns.outlineVersion, outlineVersion),
      ),
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

    const [failedRun] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));
    expect(failedRun.status).toBe("failed");
    const [failedCourse] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(failedCourse.status).toBe("failed");

    /* The retry: written Lessons are kept, review is opened again. */
    reviewState.throwFactual = false;
    headerState.current = new Headers({ cookie: ownerCookie });
    expect(await retryCourseAction(courseId)).toMatchObject({ ok: true });
    const [reopened] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));
    expect(reopened.status).toBe("running");

    /* Any lesson prompt reaching the model would rewrite a Lesson with
       this response. */
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

    const reviews = await db
      .select()
      .from(reviewRuns)
      .where(eq(reviewRuns.courseId, courseId));
    expect(reviews).toHaveLength(2);
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(1);
  });
});

describe("a staged revision whose review fails", () => {
  it("retry skips the written Lessons and the reconciliation, and the Course stays ready", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    const staged = await stageForReal(courseId, planId);

    /* First attempt: reconcile, write l1, then the review explodes. */
    reviewState.throwFactual = true;
    modelState.current = scriptedModel([
      reconcileJson(OUTLINE),
      lessonJson("Lesson one"),
    ]);
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
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    const staged = await stageForReal(courseId, planId);

    reviewState.throwFactual = false;
    modelState.current = scriptedModel([
      reconcileJson(OUTLINE),
      lessonJson("Lesson one"),
    ]);
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

    /* The review run that just passed is still passed. */
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
