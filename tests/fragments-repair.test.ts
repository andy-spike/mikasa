/**
 * Recoverable fragment embedding (bug 9): the Tutor's search index can
 * fail to embed at publication without invalidating anything. An embed
 * failure leaves the Course ready and the revision published, records
 * the failure on the run alone, and the repair finishes the job; an
 * undo re-embeds the restored Lessons so the Tutor stops serving
 * pre-undo content.
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

/* The durable engine, captured: tests run the workflow bodies in place
   and assert on what the actions dispatched. */
const startCalls = vi.hoisted(() => ({
  list: [] as { workflow: unknown; args: unknown[] }[],
}));
vi.mock("workflow/api", () => ({
  start: async (workflow: unknown, ...args: unknown[]) => {
    startCalls.list.push({ workflow, args });
    return { runId: "wrun_test" };
  },
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

/* The generation model is scripted per test; the embedder is switched
   per test, so a failure can be injected exactly once. */
const modelState = vi.hoisted(() => ({
  current: undefined as ReturnType<
    typeof import("./helpers/fake-model").scriptedModel
  > | undefined,
}));
const embedState = vi.hoisted(() => ({
  current: (texts: string[]) =>
    Promise.resolve(texts.map(() => new Array<number>(768).fill(0.01))),
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    generationModel: () => modelState.current!.model,
    embedTexts: (texts: string[]) => embedState.current(texts),
  };
});

const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");
const { json, scriptedModel } = await import("./helpers/fake-model");
const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const {
  courseSpecs,
  courses,
  generationRuns,
  outlines,
  reviewRuns,
  users,
} = await import("@/lib/db/schema");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { publishRevision, currentRevision } = await import("@/lib/db/review");
const { listFragments, searchIsIncomplete } = await import("@/lib/db/fragments");
const { createChangePlan, stagePlanRevision, planContentAdjustments, planHasStructuralChanges } =
  await import("@/lib/db/tailor");
const { specNeedsReconciliation } = await import("@/lib/course/reconcile");
const { embedCourseFragments } = await import("@/lib/course/fragments");
const { reviewTailorOperationAction, undoPlanRevisionAction } = await import(
  "@/lib/actions/tailor"
);
const { rebuildFragmentsAction } = await import("@/lib/actions/courses");
const { repairFragmentsBody, repairFragmentsWorkflow } = await import(
  "@/workflows/repair-fragments"
);
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

/** One reconcile response covering the staged shape, as the model returns it. */
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

/** A published Course whose search index is embedded for its revision. */
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
  startCalls.list = [];
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
  const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } })
    .plan;
  headerState.current = new Headers({ cookie: ownerCookie });
  for (const operation of plan.operations) {
    await reviewTailorOperationAction(plan.id, operation.id, "accepted");
  }
  return plan.id;
}

/**
 * Stages the plan through the real staging transaction and runs the
 * durable revision in place, with the embedder the test installed.
 */
async function stageAndPublish(
  courseId: string,
  planId: string,
  responses: string[],
): Promise<{ ok: boolean; revisionNumber?: number; reason?: string }> {
  const staged = await stagePlanRevision(db, await userIdOf(OWNER), courseId, planId);
  if (!staged.ok) throw new Error(`staging refused: ${staged.message}`);

  const [specRow] = await db
    .select()
    .from(courseSpecs)
    .where(and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, 1)));
  const [stagedOutline] = await db
    .select()
    .from(outlines)
    .where(
      and(eq(outlines.courseId, courseId), eq(outlines.version, staged.stagedOutlineVersion)),
    );
  const adjustments = await planContentAdjustments(db, planId);
  const structural = await planHasStructuralChanges(db, planId);
  const full = structural || specNeedsReconciliation(specRow.spec, stagedOutline.data, adjustments)
    ? [reconcileJson(stagedOutline.data), ...responses]
    : responses;
  modelState.current = scriptedModel(full);
  return stageRevisionWorkflow(
    courseId,
    planId,
    staged.runId,
    staged.stagedOutlineVersion,
    staged.baseRevisionNumber,
    staged.regenerateLessonRefs,
    staged.embedLessonRefs,
  );
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

describe("a revision whose embedding fails", () => {
  it("publishes anyway, records the failure on the run, and offers the rebuild", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    embedState.current = async () => {
      throw new Error("The embedding provider is down.");
    };

    const result = await stageAndPublish(courseId, planId, [
      lessonJson("Lesson one"),
    ]);

    /* The publication stands; only the search index is behind. */
    expect(result).toMatchObject({ ok: true, revisionNumber: 2 });
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(2);

    const run = await runRow(courseId, 2);
    expect(run.fragmentsStatus).toBe("failed");
    expect(run.fragmentsError).toContain("The embedding provider is down.");
    /* The failure no longer masquerades as a step. */
    expect(run.currentStep).not.toContain("fragments-failed");

    /* The reading page sees the gap and would offer the rebuild. */
    expect(await searchIsIncomplete(db, courseId)).toBe(true);
  });

  it("repairs the index without touching the published Course", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    embedState.current = async () => {
      throw new Error("The embedding provider is down.");
    };
    await stageAndPublish(courseId, planId, [lessonJson("Lesson one")]);

    /* The action dispatches the durable repair for the current revision. */
    headerState.current = new Headers({ cookie: ownerCookie });
    const dispatched = await rebuildFragmentsAction(courseId);
    expect(dispatched).toEqual({ ok: true });
    const dispatch = startCalls.list.find((c) => c.workflow === repairFragmentsWorkflow);
    expect(dispatch?.args[0]).toEqual([courseId, 2]);

    /* The repair re-embeds the whole revision and marks the run done. */
    embedState.current = async (texts: string[]) =>
      texts.map(() => new Array<number>(768).fill(0.01));
    const fragmentsBefore = await listFragments(db, courseId);
    expect(fragmentsBefore.filter((f) => f.lessonRef === "l1").length).toBeGreaterThan(0);

    await repairFragmentsBody(db, embedState.current, courseId, 2, null);

    const run = await runRow(courseId, 2);
    expect(run.fragmentsStatus).toBe("done");
    expect(run.fragmentsError).toBeNull();

    const fragmentsAfter = await listFragments(db, courseId);
    const l1 = fragmentsAfter.filter((f) => f.lessonRef === "l1");
    expect(l1.length).toBeGreaterThan(0);
    expect(JSON.stringify(l1)).toContain("Repainted: **Lesson one**");
    expect(await searchIsIncomplete(db, courseId)).toBe(false);
  });
});

describe("undoing a published change", () => {
  it("re-embeds the restored Lessons, so the Tutor stops serving pre-undo content", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    await stageAndPublish(courseId, planId, [lessonJson("Lesson one")]);

    /* The published revision's fragments describe the rewrite. */
    const published = await listFragments(db, courseId);
    expect(JSON.stringify(published.filter((f) => f.lessonRef === "l1"))).toContain(
      "Repainted: **Lesson one**",
    );

    headerState.current = new Headers({ cookie: ownerCookie });
    const undone = await undoPlanRevisionAction(courseId, planId);
    expect(undone).toMatchObject({ ok: true, revisionNumber: 3 });

    /* The undo dispatched the repair for the restored Lesson. */
    const dispatch = startCalls.list.at(-1);
    expect(dispatch?.workflow).toBe(repairFragmentsWorkflow);
    expect(dispatch?.args[0]).toEqual([courseId, 3, ["l1"]]);

    /* The repair swaps the fragments back to the restored content. */
    await repairFragmentsBody(db, embedState.current, courseId, 3, ["l1"]);
    const restored = await listFragments(db, courseId);
    const l1 = JSON.stringify(restored.filter((f) => f.lessonRef === "l1"));
    expect(l1).toContain("Lesson l1 of the wash course.");
    expect(l1).not.toContain("Repainted");
  });
});
