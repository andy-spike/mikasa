import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
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

const { db } = await import("@/lib/db");
const { changePlans, courses, generationRuns, users } = await import("@/lib/db/schema");
const { currentRevision } = await import("@/lib/db/review");
const { failGenerationRun } = await import("@/lib/db/outline");
const { stagePlanRevision } = await import("@/lib/db/tailor");
const { discardStagedRevisionAction } = await import("@/lib/actions/tailor");
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

function seedCourse(ownerEmail: string): Promise<string> {
  return seedPublishedCourse({
    ownerEmail,
    outline: OUTLINE,
    spec: SPEC,
    grounding: false,
    allModules: true,
  });
}

let ownerCookie = "";

beforeEach(async () => {
  setRequestCookie(null);
  ownerCookie = await signInWithGoogle(OWNER);
});

afterEach(async () => {
  await db.delete(users);
  setRequestCookie(null);
});

function proposeAndAccept(courseId: string, ops: ChangePlanOp[]): Promise<string> {
  return acceptPlan(courseId, ops, OWNER, ownerCookie);
}

async function stage(courseId: string, planId: string): Promise<string> {
  const staged = await stagePlanRevision(db, await userIdOf(OWNER), courseId, planId);
  expect(staged.ok).toBe(true);
  return (staged as { ok: true; runId: string }).runId;
}

describe("discarding a staged revision", () => {
  it("supersedes a failed plan, leaves the Course on duty, and lets a fresh plan stage", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    const runId = await stage(courseId, planId);

    await failGenerationRun(db, courseId, runId, "The model refused.", {
      touchCourse: false,
    });

    setRequestCookie(ownerCookie);
    const discarded = await discardStagedRevisionAction(courseId, planId);
    expect(discarded).toEqual({ ok: true });

    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("superseded");

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");
    expect((await currentRevision(db, courseId))?.revisionNumber).toBe(1);

    const freshPlanId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l2", instruction: "Lead with the pigment." },
    ]);
    const staged = await stagePlanRevision(db, await userIdOf(OWNER), courseId, freshPlanId);
    expect(staged.ok).toBe(true);
  });

  it("refuses while the run is still going, and accepts the crash-between-publish-and-mark shape", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    const runId = await stage(courseId, planId);

    setRequestCookie(ownerCookie);
    const refused = await discardStagedRevisionAction(courseId, planId);
    expect(refused).toMatchObject({ ok: false, reason: "not-discardable" });
    const [staged1] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(staged1.status).toBe("staged");

    /* Succeeded without publishing the staged version (the crash edge):
       the plan is dead either way, so discard is allowed. */
    await db
      .update(generationRuns)
      .set({ status: "succeeded", updatedAt: new Date() })
      .where(eq(generationRuns.id, runId));
    const discarded = await discardStagedRevisionAction(courseId, planId);
    expect(discarded).toEqual({ ok: true });
    const [staged2] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(staged2.status).toBe("superseded");
  });

  it("refuses a plan that never staged", async () => {
    const courseId = await seedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);

    setRequestCookie(ownerCookie);
    const refused = await discardStagedRevisionAction(courseId, planId);
    expect(refused).toMatchObject({ ok: false, reason: "not-discardable" });
  });
});
