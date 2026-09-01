/**
 * The staged Course revision (ticket #14), end to end: staging a
 * published Course's plan leaves the current Course readable and copies
 * the unaffected Lessons; running the revision regenerates only the
 * affected content, reviews only its scope, and swaps the revision
 * atomically; a failed run preserves the current Course and retries; a
 * plan drawn against an older revision is refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";

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

/* The durable engine, stubbed: `start` records what it was handed. */
const workflowStarts = vi.hoisted(() => ({
  calls: [] as unknown[][],
}));
vi.mock("workflow/api", () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    workflowStarts.calls.push(args);
    return { runId: `wrun_${workflowStarts.calls.length}` };
  },
}));

/* The review's model-driven slices, captured: the point of #14 is that a
   staged revision reruns them only for the regenerated Lessons. The
   structural slice is exercised for real elsewhere. */
const reviewSlices = vi.hoisted(() => ({
  factualScope: [] as string[][],
  designScope: [] as string[][],
}));
vi.mock("@/lib/course/review", () => ({
  structuralFindings: () => [],
  factualFindings: async (
    _model: unknown,
    _course: unknown,
    _spec: unknown,
    _sources: unknown,
    lessons: { lessonId: string }[],
  ) => {
    reviewSlices.factualScope.push(lessons.map((l) => l.lessonId));
    return [];
  },
  designFindings: async (
    _model: unknown,
    _course: unknown,
    _spec: unknown,
    _outline: unknown,
    lessons: { lessonId: string }[],
  ) => {
    reviewSlices.designScope.push(lessons.map((l) => l.lessonId));
    return [];
  },
  correctLesson: vi.fn(),
  MAX_CORRECTION_ROUNDS: 2,
}));

/* The generation model and the embedder, scripted per test. */
const revisionModelState = vi.hoisted(() => ({
  current: undefined as ReturnType<
    typeof import("./helpers/fake-model").scriptedModel
  > | undefined,
}));
const embedCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    generationModel: () => revisionModelState.current!.model,
    embedTexts: async (texts: string[]) => {
      embedCalls.count += 1;
      return texts.map(() => new Array<number>(768).fill(0.01));
    },
  };
});

const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const {
  changePlans,
  courses,
  courseSpecs,
  generationRuns,
  lessonFragments,
  lessons,
  outlines,
  reviewRuns,
  revisions,
  users,
} = await import("@/lib/db/schema");
const { parseLessonContent } = await import("@/lib/course/content");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { publishRevision, currentRevision } = await import("@/lib/db/review");
const { createChangePlan } = await import("@/lib/db/tailor");
const { embedCourseFragments } = await import("@/lib/course/fragments");
const {
  reviewTailorOperationAction,
  retryPlanRevisionAction,
  stagePlanRevisionAction,
} = await import("@/lib/actions/tailor");
const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");
const { json, scriptedModel } = await import("./helpers/fake-model");
const { stageRevisionWorkflow } = await import("@/workflows/course-revision");

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
  learningGraph: [{ id: "g1", skill: "Load the brush", requires: [], lessonId: "l1" }],
  alignment: [
    { lessonId: "l1", performance: "does", prerequisiteNodes: [], moduleMilestone: "m", exerciseContribution: "c" },
    { lessonId: "l2", performance: "does", prerequisiteNodes: [], moduleMilestone: "m", exerciseContribution: "c" },
    { lessonId: "l3", performance: "does", prerequisiteNodes: [], moduleMilestone: "m", exerciseContribution: "c" },
  ],
  finalExercise: { task: "Paint it", acceptanceChecks: ["It holds"] },
  evidence: [],
};

function lessonContent(lessonId: string, title: string, text: string) {
  return parseLessonContent(lessonId, title, {
    body: [{ kind: "p", text }],
    workedExample: [{ kind: "p", text: "The sky wash, again." }],
    recallPrompt: "Recall it.",
    selfExplanationPrompt: "Explain it.",
    exercise: { task: "Paint one.", check: "It holds." },
    bridge: "Next.",
  });
}

function lessonJson(title: string): string {
  return json({
    body: [{ kind: "p", text: `Repainted: **${title}** works now.` }],
    workedExample: [{ kind: "p", text: "The sky wash, again." }],
    recallPrompt: `What does ${title} do?`,
    selfExplanationPrompt: "Why this order?",
    exercise: { task: `Do ${title}.`, check: "It runs." },
    bridge: "Next.",
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

/** A published three-Lesson Course with fragments, for the given owner. */
async function seedPublishedCourse(ownerEmail: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "Watercolor washes",
      goal: "Paint a clean wash",
      depth: "reach",
      grounding: false,
      status: "reviewing",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  const [run] = await db
    .insert(generationRuns)
    .values({ courseId: course.id, outlineVersion: 1 })
    .returning();

  for (const [i, l] of OUTLINE.modules[0].lessons.entries()) {
    await saveLessonContent(
      db,
      course.id,
      1,
      run.id,
      lessonContent(l.id, l.title, `Lesson ${i + 1} of the wash course.`),
    );
  }

  const [review] = await db
    .insert(reviewRuns)
    .values({ courseId: course.id, outlineVersion: 1, status: "succeeded" })
    .returning();
  const published = await publishRevision(db, course.id, 1, review.id);
  expect(published.ok).toBe(true);

  /* The Tutor's search index, as ticket #11 left it. */
  await embedCourseFragments(
    db,
    async (texts) => texts.map(() => new Array<number>(768).fill(0.01)),
    course.id,
    1,
  );
  return course.id;
}

const OWNER = "owner@example.com";
let ownerCookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  ownerCookie = await signInWithGoogle(OWNER);
  reviewSlices.factualScope = [];
  reviewSlices.designScope = [];
  embedCalls.count = 0;
  workflowStarts.calls.length = 0;
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

/**
 * Accepts a three-operation plan: rewrite Lesson one's prose, remove
 * Lesson two, rename Lesson three. One regenerated, one removed, one
 * merely retitled — the three fates #14 has to keep straight.
 */
async function proposeAndAccept(courseId: string): Promise<string> {
  const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
  const created = await createChangePlan(db, userId, courseId, [
    { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    { kind: "removeLesson", lessonId: "l2" },
    { kind: "renameLesson", lessonId: "l3", title: "Lesson three, Repainted", summary: "Third." },
  ]);
  expect(created.ok).toBe(true);
  const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } }).plan;
  headerState.current = new Headers({ cookie: ownerCookie });
  for (const operation of plan.operations) {
    await reviewTailorOperationAction(plan.id, operation.id, "accepted");
  }
  return plan.id;
}

describe("stagePlanRevisionAction", () => {
  it("stages a candidate without touching the current Course, copying the unaffected Lessons", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId);

    const result = await stagePlanRevisionAction(courseId, planId);
    expect(result).toMatchObject({ ok: true, stagedOutlineVersion: 2 });

    /* The current revision is still revision 1 over version 1. */
    const revision = await currentRevision(db, courseId);
    expect(revision?.revisionNumber).toBe(1);
    expect(revision?.outlineVersion).toBe(1);

    /* The staged Outline: Lesson two gone, Lesson three renamed. */
    const [staged] = await db
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version));
    expect(staged.version).toBe(2);
    const stagedLessons = staged.data.modules[0].lessons.map((l) => l.id);
    expect(stagedLessons).toEqual(["l1", "l3"]);

    /* Only the retitled Lesson was copied, under its new name; the
       regenerated one is the workflow's job. */
    const rows = await db.select().from(lessons).where(eq(lessons.outlineVersion, 2));
    expect(rows.map((r) => [r.lessonRef, r.title])).toEqual([
      ["l3", "Lesson three, Repainted"],
    ]);

    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("staged");
    expect(plan.stagedOutlineVersion).toBe(2);
    const runs = await db.select().from(generationRuns).orderBy(generationRuns.outlineVersion);
    expect(runs.map((r) => r.outlineVersion)).toEqual([1, 2]);
    expect(workflowStarts.calls).toHaveLength(1);
  });

  it("refuses a plan drawn against an older revision", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const created = await createChangePlan(db, userId, courseId, [
      { kind: "renameLesson", lessonId: "l1", title: "Renamed", summary: "First." },
    ]);
    expect(created.ok).toBe(true);

    /* A newer revision exists by the time the plan is staged. */
    await db.insert(revisions).values({ courseId, revisionNumber: 2, outlineVersion: 1 });
    const current = await currentRevision(db, courseId);
    expect(current?.revisionNumber).toBe(2);

    headerState.current = new Headers({ cookie: ownerCookie });
    const planId = (created as { ok: true; plan: { id: string } }).plan.id;
    const result = await stagePlanRevisionAction(courseId, planId);
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("proposed");
  });
});

describe("stageRevisionWorkflow", () => {
  it("regenerates only the affected Lesson, retains the rest, and swaps the revision atomically", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId);
    headerState.current = new Headers({ cookie: ownerCookie });
    const staged = await stagePlanRevisionAction(courseId, planId);
    expect(staged).toMatchObject({ ok: true, stagedOutlineVersion: 2 });
    embedCalls.count = 0;

    /* The regenerated Lesson's new content, scripted. */
    revisionModelState.current = scriptedModel([lessonJson("Lesson one")]);

    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.outlineVersion, 2));
    const result = await stageRevisionWorkflow(
      courseId,
      planId,
      run.id,
      2,
      1,
      ["l1"],
      ["l1", "l2", "l3"],
    );
    expect(result).toEqual({ ok: true, revisionNumber: 2 });

    /* The revision swapped: current is now revision 2 over version 2. */
    const revision = await currentRevision(db, courseId);
    expect(revision?.revisionNumber).toBe(2);
    expect(revision?.outlineVersion).toBe(2);
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");

    /* The affected Lesson reran (scripted content), the retitled Lesson
       was retained byte-for-byte under its new name, and the removed one
       left no row. */
    const v2 = await db.select().from(lessons).where(eq(lessons.outlineVersion, 2));
    expect(v2.map((r) => r.lessonRef)).toEqual(["l1", "l3"]);
    const l1v2 = v2.find((r) => r.lessonRef === "l1")!;
    expect(JSON.stringify(l1v2.body)).toContain("Repainted");
    const v1 = await db.select().from(lessons).where(eq(lessons.outlineVersion, 1));
    const l3v1 = v1.find((r) => r.lessonRef === "l3")!;
    const l3v2 = v2.find((r) => r.lessonRef === "l3")!;
    expect(l3v2.body).toEqual(l3v1.body);
    expect(l3v2.title).toBe("Lesson three, Repainted");

    /* Only the affected Lessons' review work reran: the factual and
       design slices saw exactly the regenerated Lesson. */
    expect(reviewSlices.factualScope).toEqual([["l1"]]);
    expect(reviewSlices.designScope).toEqual([["l1"]]);

    /* Embeddings reran, and the search index now answers from the
       published revision: Lesson two's fragments are gone. */
    expect(embedCalls.count).toBeGreaterThan(0);
    const fragmentRefs = (await db.select().from(lessonFragments)).map((f) => f.lessonRef);
    expect(fragmentRefs).not.toContain("l2");
    expect(fragmentRefs).toContain("l1");
    expect(fragmentRefs).toContain("l3");

    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("published");
  });

  it("preserves the current Course on failure, and a retry finishes the job", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId);
    headerState.current = new Headers({ cookie: ownerCookie });
    const staged = await stagePlanRevisionAction(courseId, planId);
    expect(staged).toMatchObject({ ok: true, stagedOutlineVersion: 2 });

    /* The regeneration model answers with nonsense: the run fails, and
       nothing published moves. */
    revisionModelState.current = scriptedModel(["this is not the JSON you are looking for"]);
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.outlineVersion, 2));
    const result = await stageRevisionWorkflow(
      courseId,
      planId,
      run.id,
      2,
      1,
      ["l1"],
      ["l1", "l2", "l3"],
    );
    expect(result).toEqual({ ok: false, reason: "revision-failed" });

    const revision = await currentRevision(db, courseId);
    expect(revision?.revisionNumber).toBe(1);
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");
    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("staged");
    expect((await db.select().from(revisions)).map((r) => r.revisionNumber)).toEqual([1]);

    /* The retry — ticket #7's rules on a plan: the failed run reopens and
       the same affected sets ride again. */
    const retried = await retryPlanRevisionAction(courseId, planId);
    expect(retried).toMatchObject({ ok: true, stagedOutlineVersion: 2 });

    /* This time the model cooperates, and the resumed run publishes. */
    revisionModelState.current = scriptedModel([lessonJson("Lesson one")]);
    const [reopened] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.outlineVersion, 2));
    const result2 = await stageRevisionWorkflow(
      courseId,
      planId,
      reopened.id,
      2,
      1,
      ["l1"],
      ["l1", "l2", "l3"],
    );
    expect(result2).toEqual({ ok: true, revisionNumber: 2 });

    const after = await currentRevision(db, courseId);
    expect(after?.revisionNumber).toBe(2);
    expect(after?.outlineVersion).toBe(2);
    const [planAfter] = await db
      .select()
      .from(changePlans)
      .where(eq(changePlans.id, planId));
    expect(planAfter.status).toBe("published");
  });
});
