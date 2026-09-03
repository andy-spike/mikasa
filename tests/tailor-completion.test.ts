/**
 * Completion across Tailor revisions and the undo (ticket #15), end to
 * end: publishing a revision applies the Completion rules — rename,
 * move, and prose changes preserve; added Lessons start incomplete;
 * Exercise rewrites, splits, and merges reset; removed Lessons keep
 * their Completion with their content — and undo rebuilds the touched
 * identities' shape, content, and Completion from the base revision,
 * refusing while a candidate is in flight or a later change overlaps.
 * A staged revision reconciles the specification to its shape first, so
 * added and split Lessons generate and the Learner's accepted demands
 * reach the model (#17).
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

/* The durable engine, stubbed: the revision runs in place. */
vi.mock("workflow/api", () => ({
  start: async () => ({ runId: "wrun_test" }),
}));

/* The review's model-driven slices: nothing finds anything, so a
   revision's review rounds pass without a model. */
vi.mock("@/lib/course/review", () => ({
  structuralFindings: () => [],
  factualFindings: async () => [],
  designFindings: async () => [],
  correctLesson: vi.fn(),
  MAX_CORRECTION_ROUNDS: 2,
}));

/* The generation model and the embedder, scripted per test. */
const revisionModelState = vi.hoisted(() => ({
  current: undefined as ReturnType<typeof import("./helpers/fake-model").scriptedModel> | undefined,
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    generationModel: () => revisionModelState.current!.model,
    embedTexts: async (texts: string[]) => texts.map(() => new Array<number>(768).fill(0.01)),
  };
});

const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const {
  changePlans,
  completions,
  courses,
  courseSpecs,
  generationRuns,
  lessons,
  outlines,
  reviewRuns,
  users,
} = await import("@/lib/db/schema");
const { parseLessonContent } = await import("@/lib/course/content");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { publishRevision, currentRevision } = await import("@/lib/db/review");
const { createChangePlan, stagePlanRevision, planContentAdjustments, planHasStructuralChanges } =
  await import("@/lib/db/tailor");
const { specNeedsReconciliation } = await import("@/lib/course/reconcile");
const { embedCourseFragments } = await import("@/lib/course/fragments");
const { listPublishedPlansAction, reviewTailorOperationAction, undoPlanRevisionAction } =
  await import("@/lib/actions/tailor");
const { markLessonDoneAction, markLessonUndoneAction } = await import("@/lib/actions/completion");
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
      ],
    },
    {
      id: "m2",
      ordinal: 2,
      numeral: "II",
      title: "Module two",
      lessons: [{ id: "l3", ordinal: 3, title: "Lesson three", summary: "Third.", minutes: 20 }],
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
    {
      lessonId: "l1",
      performance: "does",
      prerequisiteNodes: [],
      moduleMilestone: "m",
      exerciseContribution: "c",
    },
    {
      lessonId: "l2",
      performance: "does",
      prerequisiteNodes: [],
      moduleMilestone: "m",
      exerciseContribution: "c",
    },
    {
      lessonId: "l3",
      performance: "does",
      prerequisiteNodes: [],
      moduleMilestone: "m",
      exerciseContribution: "c",
    },
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

/** A published two-Module Course with fragments, for the given owner. */
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

  for (const m of OUTLINE.modules) {
    for (const l of m.lessons) {
      await saveLessonContent(
        db,
        course.id,
        1,
        run.id,
        lessonContent(l.id, l.title, `Lesson ${l.id} of the wash course.`),
      );
    }
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
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

async function userIdOf(email: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user.id;
}

/** A plan with every operation accepted, as the pane's review leaves it. */
async function proposeAndAccept(courseId: string, ops: ChangePlanOp[]): Promise<string> {
  const created = await createChangePlan(db, await userIdOf(OWNER), courseId, ops);
  expect(created.ok).toBe(true);
  const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } }).plan;
  headerState.current = new Headers({ cookie: ownerCookie });
  for (const operation of plan.operations) {
    await reviewTailorOperationAction(plan.id, operation.id, "accepted");
  }
  return plan.id;
}

/**
 * One reconcile response for the staged Outline: an alignment entry per
 * Lesson, the way the reconciled specification must cover the shape.
 */
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

/**
 * Stages the plan through the real staging transaction and runs the
 * durable revision in place. The scripted model answers the
 * reconciliation first when the staged shape needs it (ticket #17),
 * then each regenerated Lesson, in Outline order.
 */
async function stageAndPublish(
  courseId: string,
  planId: string,
  responses: string[],
): Promise<number> {
  const staged = await stagePlanRevision(db, await userIdOf(OWNER), courseId, planId);
  if (!staged.ok) throw new Error(`staging refused: ${staged.message}`);

  const [specRow] = await db.select().from(courseSpecs).where(eq(courseSpecs.courseId, courseId));
  const [stagedOutline] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, staged.stagedOutlineVersion)));
  const adjustments = await planContentAdjustments(db, planId);
  const structural = await planHasStructuralChanges(db, planId);
  const full =
    structural || specNeedsReconciliation(specRow.spec, stagedOutline.data, adjustments)
      ? [reconcileJson(stagedOutline.data), ...responses]
      : responses;
  revisionModelState.current = scriptedModel(full);
  const result = await stageRevisionWorkflow(
    courseId,
    planId,
    staged.runId,
    staged.stagedOutlineVersion,
    staged.baseRevisionNumber,
    staged.regenerateLessonRefs,
    staged.embedLessonRefs,
  );
  if (!result.ok) {
    const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, staged.runId));
    throw new Error(`revision failed (${result.reason}): ${run?.error ?? "no message"}`);
  }
  expect(result.revisionNumber).toEqual(expect.any(Number));
  return (result as { ok: true; revisionNumber: number }).revisionNumber;
}

async function markDone(courseId: string, lessonRef: string): Promise<void> {
  headerState.current = new Headers({ cookie: ownerCookie });
  const result = await markLessonDoneAction(courseId, lessonRef);
  expect(result.ok).toBe(true);
}

/** The Course's Completion rows, as [Lesson ref, done-at] pairs. */
async function completionRows(): Promise<[string, string][]> {
  const rows = await db.select().from(completions);
  return rows
    .map((r) => [r.lessonRef, r.doneAt.toISOString()] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

async function currentOutlineData(courseId: string) {
  const revision = await currentRevision(db, courseId);
  const [outline] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, revision!.outlineVersion)));
  return outline.data;
}

async function lessonRows(courseId: string, version: number) {
  return db
    .select()
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, version)));
}

async function planRow(planId: string) {
  const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
  return plan;
}

describe("publishing a revision", () => {
  it("keeps Completion through rename, move, and prose changes", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    for (const id of ["l1", "l2", "l3"]) await markDone(courseId, id);
    const before = await completionRows();

    const planId = await proposeAndAccept(courseId, [
      { kind: "renameLesson", lessonId: "l1", title: "Lesson one, retitled", summary: "First." },
      { kind: "moveLesson", lessonId: "l2", toModuleId: "m2", toIndex: 0 },
      {
        kind: "lessonProse",
        lessonId: "l3",
        instruction: "Lead with the water-to-pigment ratio.",
      },
    ]);
    const revisionNumber = await stageAndPublish(courseId, planId, [lessonJson("Lesson three")]);
    expect(revisionNumber).toBe(2);

    /* The same three rows, down to the moment of completion. */
    expect(await completionRows()).toEqual(before);

    const outline = await currentOutlineData(courseId);
    expect(outline.modules[0].lessons.map((l) => [l.id, l.title])).toEqual([
      ["l1", "Lesson one, retitled"],
    ]);
    expect(outline.modules[1].lessons.map((l) => l.id)).toEqual(["l2", "l3"]);
    const v2 = await lessonRows(courseId, 2);
    expect(JSON.stringify(v2.find((r) => r.lessonRef === "l3")!.body)).toContain("Repainted");
  });

  it("starts added Lessons incomplete and resets an Exercise rewrite", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    for (const id of ["l1", "l2", "l3"]) await markDone(courseId, id);
    const before = await completionRows();

    const planId = await proposeAndAccept(courseId, [
      { kind: "addLesson", moduleId: "m1", title: "Lesson four", summary: "Fourth." },
      {
        kind: "exercise",
        lessonId: "l1",
        task: "Wash the sky, graded",
        check: "Three tones, no blooms.",
      },
    ]);
    await stageAndPublish(courseId, planId, [lessonJson("Lesson one"), lessonJson("Lesson four")]);

    /* The rewritten Exercise redefined "done" for its Lesson; the new
       Lesson has never been done; the rest kept their moment. */
    expect(await completionRows()).toEqual(before.filter(([ref]) => ref !== "l1"));
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.completedAt).toBeNull();

    const outline = await currentOutlineData(courseId);
    const added = outline.modules[0].lessons.find((l) => l.title === "Lesson four")!;
    const v2 = await lessonRows(courseId, 2);
    expect(JSON.stringify(v2.find((r) => r.lessonRef === added.id)!.body)).toContain(
      "Repainted: **Lesson four**",
    );

    /* The staged revision reconciled the specification (#17): the added
       Lesson has its alignment entry, the spec now matches the staged
       version, and the Learner's Exercise demand rode into the
       specification that generation read. */
    const [specRow] = await db
      .select()
      .from(courseSpecs)
      .where(and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, 2)));
    expect(specRow.outlineVersion).toBe(2);
    expect(specRow.spec.alignment.map((a) => a.lessonId)).toEqual(
      expect.arrayContaining(["l1", "l2", "l3", added.id]),
    );
    expect(specRow.spec.adjustments).toEqual([
      {
        lessonId: "l1",
        exercise: { task: "Wash the sky, graded", check: "Three tones, no blooms." },
      },
    ]);
    expect(
      revisionModelState.current!.prompts.some((p) =>
        p.includes("The learner set this Lesson's Exercise"),
      ),
    ).toBe(true);
  });

  it("resets Completion for split and merge Lessons, and undo restores both halves", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    for (const id of ["l1", "l2", "l3"]) await markDone(courseId, id);
    const untouched = (await completionRows()).filter(([ref]) => ref !== "l2");

    const splitId = await proposeAndAccept(courseId, [
      {
        kind: "splitLesson",
        lessonId: "l2",
        secondTitle: "Lesson two, part two",
        secondSummary: "Second, again.",
      },
    ]);
    await stageAndPublish(courseId, splitId, [
      lessonJson("Lesson two"),
      lessonJson("Lesson two, part two"),
    ]);

    /* Both halves need their own Exercise done. */
    expect((await completionRows()).map(([ref]) => ref)).toEqual(["l1", "l3"]);
    const outline = await currentOutlineData(courseId);
    const half = outline.modules[0].lessons.find((l) => l.title === "Lesson two, part two")!;
    await markDone(courseId, half.id);
    await markDone(courseId, "l2");
    const refs = (await completionRows()).map(([ref]) => ref);
    expect(refs).toHaveLength(4);
    expect(new Set(refs)).toEqual(new Set(["l1", "l2", "l3", half.id]));

    /* Merging the halves back redefines "done" for the surviving
       Lesson: its Completion resets. The absorbed half keeps its
       Completion, like a removed Lesson's. */
    const mergeId = await proposeAndAccept(courseId, [
      { kind: "mergeLesson", lessonId: "l2", direction: "next" },
    ]);
    const revisionNumber = await stageAndPublish(courseId, mergeId, [lessonJson("Lesson two")]);
    expect(revisionNumber).toBe(3);

    const after = await completionRows();
    expect(after.map(([ref]) => ref).sort()).toEqual(["l1", "l3", half.id].sort());
    expect(after.filter(([ref]) => ref !== half.id)).toEqual(untouched);
    const v3 = await lessonRows(courseId, 3);
    expect(v3.map((r) => r.lessonRef).sort()).toEqual(["l1", "l2", "l3"]);
    expect(JSON.stringify(v3.find((r) => r.lessonRef === "l2")!.body)).toContain(
      "Repainted: **Lesson two**",
    );

    /* Undoing the merge brings the half back — shape, content, and the
       Completion of both halves. */
    headerState.current = new Headers({ cookie: ownerCookie });
    const undone = await undoPlanRevisionAction(courseId, mergeId);
    expect(undone).toMatchObject({ ok: true, revisionNumber: 4 });

    const outlineAfter = await currentOutlineData(courseId);
    expect(outlineAfter.modules[0].lessons.map((l) => l.id)).toEqual(["l1", "l2", half.id]);
    expect(outlineAfter.modules[1].lessons.map((l) => l.id)).toEqual(["l3"]);
    const v4 = await lessonRows(courseId, 4);
    expect(v4.find((r) => r.lessonRef === half.id)!.body).toEqual(
      (await lessonRows(courseId, 2)).find((r) => r.lessonRef === half.id)!.body,
    );
    const restored = await completionRows();
    expect(restored).toHaveLength(4);
    expect(new Set(restored.map(([ref]) => ref))).toEqual(new Set(["l1", "l2", "l3", half.id]));
    expect((await planRow(mergeId)).status).toBe("undone");
  });

  it("keeps a removed Lesson's Completion with its content, and undo restores both", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    await markDone(courseId, "l2");
    const doneAt = (await completionRows())[0][1];

    const planId = await proposeAndAccept(courseId, [{ kind: "removeLesson", lessonId: "l2" }]);
    const revisionNumber = await stageAndPublish(courseId, planId, []);
    expect(revisionNumber).toBe(2);

    /* Nothing regenerated; the remove is structural, so the staged
       specification was reconciled to the smaller shape with one model
       call, and the version-2 spec row exists beside the untouched base. */
    expect(revisionModelState.current!.calls()).toBe(1);
    const [specV2] = await db
      .select()
      .from(courseSpecs)
      .where(and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, 2)));
    expect(specV2.spec.alignment.map((a) => a.lessonId)).toEqual(["l1", "l3"]);

    /* The Completion survives, pointing at content the older revision
       still holds. */
    expect(await completionRows()).toEqual([["l2", doneAt]]);
    expect((await lessonRows(courseId, 2)).map((r) => r.lessonRef)).toEqual(["l1", "l3"]);
    const v1 = await lessonRows(courseId, 1);
    expect(v1.map((r) => r.lessonRef)).toEqual(["l1", "l2", "l3"]);

    /* Removed Completion does not count toward the current Course. */
    headerState.current = new Headers({ cookie: ownerCookie });
    const marked = await markLessonDoneAction(courseId, "l1");
    expect(marked).toMatchObject({ ok: true, doneCount: 1, total: 2, courseComplete: false });
    const l1DoneAt = (await completionRows()).find(([ref]) => ref === "l1")![1];

    headerState.current = new Headers({ cookie: ownerCookie });
    const undone = await undoPlanRevisionAction(courseId, planId);
    expect(undone).toMatchObject({ ok: true, revisionNumber: 3 });

    const outline = await currentOutlineData(courseId);
    expect(outline.modules[0].lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(outline.modules[1].lessons.map((l) => l.id)).toEqual(["l3"]);
    const v3 = await lessonRows(courseId, 3);
    expect(v3.find((r) => r.lessonRef === "l2")!.body).toEqual(
      v1.find((r) => r.lessonRef === "l2")!.body,
    );
    expect(v3.find((r) => r.lessonRef === "l2")!.title).toBe("Lesson two");
    /* l2's Completion is restored to its original moment; l1's, marked
       after the removal on content the undo never touches, survives. */
    expect(await completionRows()).toEqual([
      ["l1", l1DoneAt],
      ["l2", doneAt],
    ]);
    expect((await planRow(planId)).status).toBe("undone");
  });

  it("undoes an added Module and its added Lesson", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "addModule", moduleId: "m3", title: "Module three" },
      { kind: "addLesson", moduleId: "m3", title: "Lesson four", summary: "Fourth." },
    ]);
    await stageAndPublish(courseId, planId, [lessonJson("Lesson four")]);
    expect((await currentOutlineData(courseId)).modules.at(-1)).toMatchObject({
      id: "m3",
      lessons: [{ title: "Lesson four" }],
    });
    expect((await planRow(planId)).touchedModules).toContain("m3");

    headerState.current = new Headers({ cookie: ownerCookie });
    expect(await undoPlanRevisionAction(courseId, planId)).toMatchObject({ ok: true });
    expect((await currentOutlineData(courseId)).modules.map((m) => m.id)).not.toContain("m3");
  });
});

describe("undoing a published change", () => {
  it("restores the touched Lesson's content and Completion, and keeps later independent changes", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    await markDone(courseId, "l1");
    await markDone(courseId, "l2");
    const before = await completionRows();
    const l1DoneAt = before.find(([ref]) => ref === "l1")![1];
    const l2DoneAt = before.find(([ref]) => ref === "l2")![1];
    const v1 = await lessonRows(courseId, 1);

    /* Plan one rewrites Lesson one's prose. */
    const planA = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    await stageAndPublish(courseId, planA, [lessonJson("Lesson one")]);
    const v2 = await lessonRows(courseId, 2);

    /* The Learner re-does Lesson one after the change published: a new
       moment of completion, which the undo must roll back. */
    headerState.current = new Headers({ cookie: ownerCookie });
    expect((await markLessonUndoneAction(courseId, "l1")).ok).toBe(true);
    await markDone(courseId, "l1");
    expect((await completionRows()).find(([ref]) => ref === "l1")![1]).not.toBe(l1DoneAt);

    /* Plan two moves Lesson two into Module two — an identity plan one
       never touched, so the undo must leave it exactly where it is. */
    const planB = await proposeAndAccept(courseId, [
      { kind: "moveLesson", lessonId: "l2", toModuleId: "m2", toIndex: 0 },
    ]);
    await stageAndPublish(courseId, planB, []);

    headerState.current = new Headers({ cookie: ownerCookie });
    const undone = await undoPlanRevisionAction(courseId, planA);
    expect(undone).toMatchObject({ ok: true, revisionNumber: 4 });

    /* Lesson one is what revision one had, Completion included; Lesson
       two keeps its own moment. */
    const v4 = await lessonRows(courseId, 4);
    const l1v4 = v4.find((r) => r.lessonRef === "l1")!;
    expect(l1v4.body).toEqual(v1.find((r) => r.lessonRef === "l1")!.body);
    expect(l1v4.body).not.toEqual(v2.find((r) => r.lessonRef === "l1")!.body);
    expect(await completionRows()).toEqual([
      ["l1", l1DoneAt],
      ["l2", l2DoneAt],
    ]);

    /* Lesson two stays moved; Module two keeps it. */
    const outline = await currentOutlineData(courseId);
    expect(outline.modules[0].lessons.map((l) => l.id)).toEqual(["l1"]);
    expect(outline.modules[1].lessons.map((l) => l.id)).toEqual(["l2", "l3"]);

    expect((await planRow(planA)).status).toBe("undone");
    expect((await planRow(planB)).status).toBe("published");

    /* A second undo has nothing left to undo. */
    const again = await undoPlanRevisionAction(courseId, planA);
    expect(again).toMatchObject({ ok: false, reason: "not-undoable" });
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(4);
  });

  it("blocks an undo behind an overlapping Module change, and unblocks once that change is undone", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    await markDone(courseId, "l1");
    const doneAt = (await completionRows())[0][1];

    /* Plan one renames Module one; plan two adds a Lesson to it. The
       Module identity overlaps. */
    const planA = await proposeAndAccept(courseId, [
      { kind: "renameModule", moduleId: "m1", title: "Module one, retitled" },
    ]);
    await stageAndPublish(courseId, planA, []);

    /* A structural plan reconciles the specification even when the base
       already joins to the shape: the staged version got its own row,
       re-derived by the model (it carries the reconciled adjustments
       key the base row never had), and the base row is untouched. */
    const [specV2, specV1] = await Promise.all([
      db
        .select()
        .from(courseSpecs)
        .where(and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, 2))),
      db
        .select()
        .from(courseSpecs)
        .where(and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, 1))),
    ]);
    expect(specV2).toHaveLength(1);
    expect(specV2[0].spec.adjustments).toEqual([]);
    expect(specV2[0].spec.alignment.map((a) => a.lessonId)).toEqual(["l1", "l2", "l3"]);
    expect(specV1[0].spec).toEqual(SPEC);
    const planB = await proposeAndAccept(courseId, [
      { kind: "addLesson", moduleId: "m1", title: "Lesson four", summary: "Fourth." },
    ]);
    await stageAndPublish(courseId, planB, [lessonJson("Lesson four")]);

    /* The pane offers the later change's undo only. */
    headerState.current = new Headers({ cookie: ownerCookie });
    const rows = await listPublishedPlansAction(courseId);
    const byId = new Map(rows.map((r) => [r.plan.id, r]));
    expect(byId.get(planA)!.canUndo).toBe(false);
    expect(byId.get(planB)!.canUndo).toBe(true);

    const blocked = await undoPlanRevisionAction(courseId, planA);
    expect(blocked).toMatchObject({ ok: false, reason: "blocked-overlap" });
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(3);
    expect((await planRow(planA)).status).toBe("published");

    /* Undoing the later change is fine: the added Lesson leaves, and the
       earlier rename stays — it was already in place when plan two was
       drawn against the renamed Module. */
    const undoneB = await undoPlanRevisionAction(courseId, planB);
    expect(undoneB).toMatchObject({ ok: true, revisionNumber: 4 });
    const outline = await currentOutlineData(courseId);
    expect(outline.modules[0].title).toBe("Module one, retitled");
    expect(outline.modules.flatMap((m) => m.lessons.map((l) => l.id))).toEqual(["l1", "l2", "l3"]);
    expect(await completionRows()).toEqual([["l1", doneAt]]);

    /* With the overlap gone, the first change undoes too. */
    expect((await listPublishedPlansAction(courseId)).map((r) => r.canUndo)).toEqual([true]);
    const undoneA = await undoPlanRevisionAction(courseId, planA);
    expect(undoneA).toMatchObject({ ok: true, revisionNumber: 5 });
    expect((await currentOutlineData(courseId)).modules[0].title).toBe("Module one");
    expect(await completionRows()).toEqual([["l1", doneAt]]);
  });

  it("blocks an undo behind an overlapping Lesson change, and the later change's undo restores the earlier state", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    await markDone(courseId, "l1");
    const doneAt = (await completionRows())[0][1];

    /* Plan one rewrites Lesson one's prose; plan two rewrites its
       Exercise, which resets the Completion the undo would restore. */
    const planA = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    await stageAndPublish(courseId, planA, [lessonJson("Lesson one")]);
    const v2 = await lessonRows(courseId, 2);
    const planB = await proposeAndAccept(courseId, [
      { kind: "exercise", lessonId: "l1", task: "Wash the sky, graded", check: "Three tones." },
    ]);
    await stageAndPublish(courseId, planB, [lessonJson("Lesson one")]);
    expect(await completionRows()).toEqual([]);

    headerState.current = new Headers({ cookie: ownerCookie });
    /* Newest revision first. */
    expect((await listPublishedPlansAction(courseId)).map((r) => r.canUndo)).toEqual([true, false]);

    /* Another Learner reads no published changes for this Course. */
    const strangerCookie = await signInWithGoogle("stranger@example.com");
    headerState.current = new Headers({ cookie: strangerCookie });
    expect(await listPublishedPlansAction(courseId)).toEqual([]);
    headerState.current = new Headers({ cookie: ownerCookie });

    const blocked = await undoPlanRevisionAction(courseId, planA);
    expect(blocked).toMatchObject({ ok: false, reason: "blocked-overlap" });
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(3);
    expect(await completionRows()).toEqual([]);
    expect((await planRow(planA)).status).toBe("published");

    /* Undoing the later change rolls Lesson one back to what plan
       one's revision held — prose content and the Completion the
       Exercise rewrite had reset. */
    const undoneB = await undoPlanRevisionAction(courseId, planB);
    expect(undoneB).toMatchObject({ ok: true, revisionNumber: 4 });
    const v4 = await lessonRows(courseId, 4);
    expect(v4.find((r) => r.lessonRef === "l1")!.body).toEqual(
      v2.find((r) => r.lessonRef === "l1")!.body,
    );
    expect(await completionRows()).toEqual([["l1", doneAt]]);
    expect((await planRow(planB)).status).toBe("undone");
  });

  it("refuses while a candidate is in flight or the plan was never published, changing nothing", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    await markDone(courseId, "l1");
    await markDone(courseId, "l2");
    const before = await completionRows();

    const planA = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    await stageAndPublish(courseId, planA, [lessonJson("Lesson one")]);

    /* A staged candidate is being built on top of the very revision
       this undo would swap away. */
    const planB = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l2", instruction: "Keep the wash wet." },
    ]);
    const staged = await stagePlanRevision(db, await userIdOf(OWNER), courseId, planB);
    expect(staged.ok).toBe(true);

    headerState.current = new Headers({ cookie: ownerCookie });
    const blocked = await undoPlanRevisionAction(courseId, planA);
    expect(blocked).toMatchObject({ ok: false, reason: "blocked-inflight" });

    /* A plan still under review has nothing to undo. */
    const planC = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l3", instruction: "Slow down at the edges." },
    ]);
    const refused = await undoPlanRevisionAction(courseId, planC);
    expect(refused).toMatchObject({ ok: false, reason: "not-undoable" });

    /* Both refusals left the Course exactly as it was. */
    const revision = await currentRevision(db, courseId);
    expect(revision?.revisionNumber).toBe(2);
    expect(revision?.outlineVersion).toBe(2);
    expect(await completionRows()).toEqual(before);
    expect((await planRow(planA)).status).toBe("published");
  });
});
