import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";

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

const workflowStarts = vi.hoisted(() => ({
  calls: [] as unknown[][],
}));
vi.mock("workflow/api", () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    workflowStarts.calls.push(args);
    return { runId: `wrun_${workflowStarts.calls.length}` };
  },
}));

/* Staged revisions review the complete candidate; the combined slice is
   proven elsewhere. */
const reviewSlices = vi.hoisted(() => ({
  combinedScope: [] as string[][],
}));
vi.mock("@/lib/course/review", () => ({
  structuralFindings: () => [],
  combinedFindings: async (
    _model: unknown,
    _course: unknown,
    _spec: unknown,
    _outline: unknown,
    _sources: unknown,
    lessons: { lessonId: string }[],
  ) => {
    reviewSlices.combinedScope.push(lessons.map((l) => l.lessonId));
    return [];
  },
  dedupeCorrectionQueries: () => [],
  correctLesson: vi.fn(),
  MAX_CORRECTION_ROUNDS: 3,
  lessonContextExcerpt: () => "",
  CORRECTION_SOURCE_QUERY_CAP: 3,
}));

const revisionModelState = vi.hoisted(() => ({
  current: undefined as ReturnType<typeof import("./helpers/fake-model").scriptedModel> | undefined,
}));
const embedCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    generationModel: () => revisionModelState.current!.model,
    embedTexts: async (texts: string[]) => {
      embedCalls.count += 1;
      return texts.map(() => new Array<number>(1536).fill(0.01));
    },
  };
});

const { db } = await import("@/lib/db");
const {
  changePlans,
  courses,
  generationRuns,
  lessonFragments,
  lessons,
  outlines,
  revisions,
  users,
} = await import("@/lib/db/schema");
const { currentRevision } = await import("@/lib/db/review");
const { createChangePlan } = await import("@/lib/db/tailor");
const { findStagedPlanAction, retryPlanRevisionAction, stagePlanRevisionAction } =
  await import("@/lib/actions/tailor");
const { signInWithGoogle } = await import("./helpers/auth");
const { setRequestCookie } = await import("./helpers/request-context");
const { makeOutline, makeSpec } = await import("./helpers/fixtures");
const {
  OWNER,
  seedPublishedCourse,
  proposeAndAccept: acceptPlan,
  washLesson,
} = await import("./helpers/published-course");
const { json, scriptedModel } = await import("./helpers/fake-model");
const { stageRevisionWorkflow } = await import("@/workflows/course-revision");

const OUTLINE = makeOutline([3]);
const SPEC = makeSpec(OUTLINE, {
  topic: "Watercolor washes",
  goal: "Paint a clean wash",
  terminalPerformances: ["Paint a wash"],
  throughline: { premise: "Water first", runningExample: "The sky wash", vocabulary: [] },
  learningGraph: [{ id: "g1", skill: "Load the brush", requires: [], lessonId: "l1" }],
  finalExercise: { task: "Paint it", acceptanceChecks: ["It holds"] },
});

function lessonJson(title: string): string {
  return json({
    body: [
      { kind: "p", text: `Repainted: **${title}** works now.` },
      { kind: "p", text: "Apply the updated idea." },
      { kind: "p", text: "Check the updated result." },
    ],
    workedExample: [{ kind: "p", text: "The sky wash, again." }],
    recallPrompt: `What does ${title} do?`,
    selfExplanationPrompt: "Why this order?",
    exercise: { task: `Do ${title}.`, check: "It runs." },
    bridge: "Next.",
    contextSummary: `${title} extends the example.`,
  });
}

function reconcileJson(lessonIds: string[]): string {
  return json({
    learningGraph: [],
    alignment: lessonIds.map((id) => ({
      lessonId: id,
      performance: `does ${id}`,
      prerequisiteNodes: [],
      moduleMilestone: "m",
      exerciseContribution: "c",
      exampleStart: "",
      exampleEnd: "",
      sourceRefs: [],
    })),
  });
}

function seedCourse(ownerEmail: string): Promise<string> {
  return seedPublishedCourse({
    ownerEmail,
    outline: OUTLINE,
    spec: SPEC,
    grounding: false,
    content: washLesson,
    embed: (texts) => texts.map(() => new Array<number>(1536).fill(0.01)),
  });
}

let ownerCookie = "";

beforeEach(async () => {
  setRequestCookie(null);
  ownerCookie = await signInWithGoogle(OWNER);
  reviewSlices.combinedScope = [];
  embedCalls.count = 0;
  workflowStarts.calls.length = 0;
});

afterEach(async () => {
  await db.delete(users);
  setRequestCookie(null);
});

function proposeAndAccept(courseId: string): Promise<string> {
  return acceptPlan(
    courseId,
    [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
      { kind: "removeLesson", lessonId: "l2" },
      { kind: "renameLesson", lessonId: "l3", title: "Lesson three, Repainted", summary: "Third." },
    ],
    OWNER,
    ownerCookie,
  );
}

describe("stagePlanRevisionAction", () => {
  it("stages a candidate without touching the current Course, copying the unaffected Lessons", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId);

    const result = await stagePlanRevisionAction(courseId, planId);
    expect(result).toMatchObject({ ok: true, stagedOutlineVersion: 2 });
    expect(await findStagedPlanAction(courseId)).toMatchObject({ stage: "queued", failed: false });

    const revision = await currentRevision(db, courseId);
    expect(revision?.revisionNumber).toBe(1);
    expect(revision?.outlineVersion).toBe(1);

    const [staged] = await db
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version));
    expect(staged.version).toBe(2);
    const stagedLessons = staged.data.modules[0].lessons.map((l) => l.id);
    expect(stagedLessons).toEqual(["l1", "l3"]);

    const rows = await db.select().from(lessons).where(eq(lessons.outlineVersion, 2));
    expect(rows.map((r) => [r.lessonRef, r.title])).toEqual([["l3", "Lesson three, Repainted"]]);
    const original = await db.select().from(lessons).where(eq(lessons.outlineVersion, 1));
    expect(rows[0].contextSummary).toBe(original.find((r) => r.lessonRef === "l3")!.contextSummary);

    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("staged");
    expect(plan.stagedOutlineVersion).toBe(2);
    const runs = await db.select().from(generationRuns).orderBy(generationRuns.outlineVersion);
    expect(runs.map((r) => r.outlineVersion)).toEqual([1, 2]);
    expect(workflowStarts.calls).toHaveLength(1);
  });

  it("refuses a plan drawn against an older revision", async () => {
    const courseId = await seedCourse(OWNER);
    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const created = await createChangePlan(db, userId, courseId, [
      { kind: "renameLesson", lessonId: "l1", title: "Renamed", summary: "First." },
    ]);
    expect(created.ok).toBe(true);

    await db.insert(revisions).values({ courseId, revisionNumber: 2, outlineVersion: 1 });
    const current = await currentRevision(db, courseId);
    expect(current?.revisionNumber).toBe(2);

    setRequestCookie(ownerCookie);
    const planId = (created as { ok: true; plan: { id: string } }).plan.id;
    const result = await stagePlanRevisionAction(courseId, planId);
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("proposed");
  });
});

describe("stageRevisionWorkflow", () => {
  it("regenerates only the affected Lesson, retains the rest, and swaps the revision atomically", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId);
    setRequestCookie(ownerCookie);
    const staged = await stagePlanRevisionAction(courseId, planId);
    expect(staged).toMatchObject({ ok: true, stagedOutlineVersion: 2 });
    embedCalls.count = 0;

    revisionModelState.current = scriptedModel([
      reconcileJson(["l1", "l3"]),
      lessonJson("Lesson one"),
    ]);

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

    const revision = await currentRevision(db, courseId);
    expect(revision?.revisionNumber).toBe(2);
    expect(revision?.outlineVersion).toBe(2);
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");

    const v2 = await db.select().from(lessons).where(eq(lessons.outlineVersion, 2));
    expect(v2.map((r) => r.lessonRef)).toEqual(["l1", "l3"]);
    const l1v2 = v2.find((r) => r.lessonRef === "l1")!;
    expect(JSON.stringify(l1v2.body)).toContain("Repainted");
    expect(l1v2.contextSummary).toBe("Lesson one extends the example.");
    const v1 = await db.select().from(lessons).where(eq(lessons.outlineVersion, 1));
    const l3v1 = v1.find((r) => r.lessonRef === "l3")!;
    const l3v2 = v2.find((r) => r.lessonRef === "l3")!;
    expect(l3v2.body).toEqual(l3v1.body);
    expect(l3v2.contextSummary).toBe(l3v1.contextSummary);
    expect(l3v2.title).toBe("Lesson three, Repainted");

    expect(reviewSlices.combinedScope).toEqual([["l1", "l3"]]);

    expect(embedCalls.count).toBeGreaterThan(0);
    const fragmentRefs = (await db.select().from(lessonFragments)).map((f) => f.lessonRef);
    expect(fragmentRefs).not.toContain("l2");
    expect(fragmentRefs).toContain("l1");
    expect(fragmentRefs).toContain("l3");

    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("published");
  });

  it("preserves the current Course on failure, and a retry finishes the job", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId);
    setRequestCookie(ownerCookie);
    const staged = await stagePlanRevisionAction(courseId, planId);
    expect(staged).toMatchObject({ ok: true, stagedOutlineVersion: 2 });

    revisionModelState.current = scriptedModel([
      reconcileJson(["l1", "l3"]),
      "this is not the JSON you are looking for",
    ]);
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

    const retried = await retryPlanRevisionAction(courseId, planId);
    expect(retried).toMatchObject({ ok: true, stagedOutlineVersion: 2 });

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
    const [planAfter] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(planAfter.status).toBe("published");
  });
});
