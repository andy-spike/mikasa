// Embed failure leaves the Course published and records the failure on the
// run alone; the repair finishes the job, and undo re-embeds the lessons.
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

const startCalls = vi.hoisted(() => ({
  list: [] as { workflow: unknown; args: unknown[] }[],
}));
vi.mock("workflow/api", () => ({
  start: async (workflow: unknown, ...args: unknown[]) => {
    startCalls.list.push({ workflow, args });
    return { runId: "wrun_test" };
  },
}));

vi.mock("@/lib/course/review", () => ({
  structuralFindings: () => [],
  factualFindings: async () => [],
  designFindings: async () => [],
  correctLesson: vi.fn(),
  MAX_CORRECTION_ROUNDS: 2,
}));

const modelState = vi.hoisted(() => ({
  current: undefined as ReturnType<typeof import("./helpers/fake-model").scriptedModel> | undefined,
}));
const embedState = vi.hoisted(() => ({
  current: (texts: string[]) =>
    Promise.resolve(texts.map(() => new Array<number>(1536).fill(0.01))),
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    generationModel: () => modelState.current!.model,
    embedTexts: (texts: string[]) => embedState.current(texts),
  };
});

const { json, scriptedModel } = await import("./helpers/fake-model");
const { db } = await import("@/lib/db");
const { courseSpecs, courses, generationRuns, outlines, users } = await import("@/lib/db/schema");
const { currentRevision } = await import("@/lib/db/review");
const { listFragments, searchIsIncomplete } = await import("@/lib/db/fragments");
const { stagePlanRevision, planContentAdjustments, planHasStructuralChanges } =
  await import("@/lib/db/tailor");
const { specNeedsReconciliation } = await import("@/lib/course/reconcile");
const { undoPlanRevisionAction } = await import("@/lib/actions/tailor");
const { rebuildFragmentsAction } = await import("@/lib/actions/courses");
const { repairFragmentsBody, repairFragmentsWorkflow } =
  await import("@/workflows/repair-fragments");
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

function seedCourse(ownerEmail: string): Promise<string> {
  return seedPublishedCourse({
    ownerEmail,
    outline: OUTLINE,
    spec: SPEC,
    grounding: false,
    allModules: true,
    embed: (texts) => texts.map(() => new Array<number>(1536).fill(0.01)),
  });
}

let ownerCookie = "";

beforeEach(async () => {
  setRequestCookie(null);
  ownerCookie = await signInWithGoogle(OWNER);
  startCalls.list = [];
});

afterEach(async () => {
  await db.delete(users);
  setRequestCookie(null);
});

function proposeAndAccept(courseId: string, ops: ChangePlanOp[]): Promise<string> {
  return acceptPlan(courseId, ops, OWNER, ownerCookie);
}

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
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, staged.stagedOutlineVersion)));
  const adjustments = await planContentAdjustments(db, planId);
  const structural = await planHasStructuralChanges(db, planId);
  const full =
    structural || specNeedsReconciliation(specRow.spec, stagedOutline.data, adjustments)
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
      and(eq(generationRuns.courseId, courseId), eq(generationRuns.outlineVersion, outlineVersion)),
    );
  return run;
}

describe("a revision whose embedding fails", () => {
  it("publishes anyway, records the failure on the run, and offers the rebuild", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    embedState.current = async () => {
      throw new Error("The embedding provider is down.");
    };

    const result = await stageAndPublish(courseId, planId, [lessonJson("Lesson one")]);

    expect(result).toMatchObject({ ok: true, revisionNumber: 2 });
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(2);

    const run = await runRow(courseId, 2);
    expect(run.fragmentsStatus).toBe("failed");
    expect(run.fragmentsError).toContain("The embedding provider is down.");
    expect(run.currentStep).not.toContain("fragments-failed");

    expect(await searchIsIncomplete(db, courseId)).toBe(true);
  });

  it("repairs the index without touching the published Course", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    embedState.current = async () => {
      throw new Error("The embedding provider is down.");
    };
    await stageAndPublish(courseId, planId, [lessonJson("Lesson one")]);

    setRequestCookie(ownerCookie);
    const dispatched = await rebuildFragmentsAction(courseId);
    expect(dispatched).toEqual({ ok: true });
    const dispatch = startCalls.list.find((c) => c.workflow === repairFragmentsWorkflow);
    expect(dispatch?.args[0]).toEqual([courseId, 2]);

    embedState.current = async (texts: string[]) =>
      texts.map(() => new Array<number>(1536).fill(0.01));
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
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    await stageAndPublish(courseId, planId, [lessonJson("Lesson one")]);

    const published = await listFragments(db, courseId);
    expect(JSON.stringify(published.filter((f) => f.lessonRef === "l1"))).toContain(
      "Repainted: **Lesson one**",
    );

    setRequestCookie(ownerCookie);
    const undone = await undoPlanRevisionAction(courseId, planId);
    expect(undone).toMatchObject({ ok: true, revisionNumber: 3 });

    const dispatch = startCalls.list.at(-1);
    expect(dispatch?.workflow).toBe(repairFragmentsWorkflow);
    expect(dispatch?.args[0]).toEqual([courseId, 3, ["l1"]]);

    await repairFragmentsBody(db, embedState.current, courseId, 3, ["l1"]);
    const restored = await listFragments(db, courseId);
    const l1 = JSON.stringify(restored.filter((f) => f.lessonRef === "l1"));
    expect(l1).toContain("Lesson l1 of the wash course.");
    expect(l1).not.toContain("Repainted");
  });
});
