/**
 * Applying a Change plan to the Outline (ticket #13), end to end: the
 * real server actions against PGlite with a real session. Mixed accepted
 * and discarded operations apply together or not at all, the Outline
 * moves past the specification so approval must reconcile it, and the
 * Learner's accepted content demands reach that reconciliation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, desc, eq } from "drizzle-orm";

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
  calls: [] as { courseId: string; runId: string; outlineVersion: number }[],
}));
vi.mock("workflow/api", () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    const [courseId, runId, outlineVersion] = args as [string, string, number];
    workflowStarts.calls.push({ courseId, runId, outlineVersion });
    return { runId: `wrun_${workflowStarts.calls.length}` };
  },
}));

/* The reconciliation, captured: the point is what approval hands it. */
const reconcileCalls = vi.hoisted(() => ({
  calls: [] as {
    outline: { modules: { lessons: { id: string }[] }[] };
    adjustments: { lessonId: string }[];
  }[],
}));
vi.mock("@/lib/course/reconcile", () => ({
  reconcileSpecification: async (
    _model: unknown,
    outline: { modules: { lessons: { id: string }[] }[] },
    previous: Record<string, unknown>,
    adjustments: { lessonId: string }[] = [],
  ) => {
    reconcileCalls.calls.push({ outline, adjustments });
    return {
      ...previous,
      learningGraph: [],
      alignment: outline.modules.flatMap((m) =>
        m.lessons.map((l) => ({
          lessonId: l.id,
          performance: "aligned",
          prerequisiteNodes: [],
          moduleMilestone: "milestone",
          exerciseContribution: "contributes",
        })),
      ),
    };
  },
}));

const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const { changePlans, courseSpecs, courses, outlines, users } = await import(
  "@/lib/db/schema"
);
const { applyOutlineOpAction, approveOutlineAction } = await import(
  "@/lib/actions/outline"
);
const { applyPlanToOutlineAction, reviewTailorOperationAction } = await import(
  "@/lib/actions/tailor"
);
const { createChangePlan } = await import("@/lib/db/tailor");
const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");

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
  ],
};

const SPEC = {
  contract: {
    topic: "the Vercel AI SDK",
    goal: "build my own AI chat app",
    background: "",
    depth: "reach",
    language: "en",
    terminalPerformances: ["Ship a chat app"],
    exclusions: [],
    learnerAssumptions: [],
  },
  throughline: { premise: "One app", runningExample: "The chat app", vocabulary: [] },
  learningGraph: [{ id: "g1", skill: "Stream text", requires: [], lessonId: "l1" }],
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
  ],
  finalExercise: { task: "Build it", acceptanceChecks: ["It runs"] },
  evidence: [],
};

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

/** A Course at the Outline checkpoint, specification fresh for version 1. */
async function seedAwaitingApproval(ownerEmail: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "the Vercel AI SDK",
      goal: "build my own AI chat app",
      depth: "reach",
      status: "awaiting-outline-approval",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  return course.id;
}

const OWNER = "owner@example.com";
const OTHER = "other@example.com";
let ownerCookie = "";
let otherCookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  ownerCookie = await signInWithGoogle(OWNER);
  otherCookie = await signInWithGoogle(OTHER);
  reconcileCalls.calls.length = 0;
  workflowStarts.calls.length = 0;
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

function asOwner() {
  headerState.current = new Headers({ cookie: ownerCookie });
}

/**
 * A three-operation plan, with the given review: rename Lesson one, add a
 * Lesson, remove Lesson two. Returns the plan id.
 */
async function proposeThree(
  courseId: string,
  reviews: ("accepted" | "discarded")[],
): Promise<string> {
  const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
  const created = await createChangePlan(db, userId, courseId, [
    { kind: "renameLesson", lessonId: "l1", title: "Lesson one, renamed", summary: "First." },
    { kind: "addLesson", moduleId: "m1", title: "A new Lesson", summary: "Fresh." },
    { kind: "removeLesson", lessonId: "l2" },
  ]);
  expect(created.ok).toBe(true);
  const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } })
    .plan;
  asOwner();
  for (const [i, status] of reviews.entries()) {
    const result = await reviewTailorOperationAction(plan.id, plan.operations[i].id, status);
    expect(result.ok).toBe(true);
  }
  return plan.id;
}

describe("applyPlanToOutlineAction", () => {
  it("applies the accepted operations together, and the discarded ones change nothing", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER);
    const planId = await proposeThree(courseId, ["accepted", "discarded", "accepted"]);

    const result = await applyPlanToOutlineAction(courseId, planId);
    expect(result).toMatchObject({ ok: true, outlineVersion: 2, appliedCount: 2 });

    const [outline] = await db
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version));
    /* One version bump, carrying exactly the accepted operations: the
       rename and the removal landed, the discarded addition did not. */
    expect(outline.version).toBe(2);
    const lessons = outline.data.modules[0].lessons;
    expect(lessons.map((l) => [l.id, l.title])).toEqual([["l1", "Lesson one, renamed"]]);

    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("applied");
  });

  it("marks the specification stale, and approval reconciles it with the accepted content demands", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER);
    /* Accept the rename and a content demand for the renamed Lesson. */
    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const created = await createChangePlan(db, userId, courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the failure mode." },
      { kind: "exercise", lessonId: "l1", task: "Stream by hand", check: "It prints chunks" },
    ]);
    expect(created.ok).toBe(true);
    const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } })
      .plan;
    asOwner();
    for (const operation of plan.operations) {
      await reviewTailorOperationAction(plan.id, operation.id, "accepted");
    }
    const applied = await applyPlanToOutlineAction(courseId, plan.id);
    expect(applied).toMatchObject({ ok: true, outlineVersion: 2 });

    const [spec] = await db
      .select()
      .from(courseSpecs)
      .where(and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, 1)));
    /* The Outline moved past the specification. */
    expect(spec.outlineVersion).toBe(1);

    const approved = await approveOutlineAction(courseId, 2);
    expect(approved).toEqual({ ok: true, duplicate: false });

    /* Approval reconciled, and the accepted demands rode with it. */
    expect(reconcileCalls.calls).toHaveLength(1);
    expect(reconcileCalls.calls[0].adjustments).toEqual([
      { lessonId: "l1", prose: "Lead with the failure mode.", exercise: { task: "Stream by hand", check: "It prints chunks" } },
    ]);
    const [reconciled] = await db
      .select()
      .from(courseSpecs)
      .where(and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, 2)));
    expect(reconciled.outlineVersion).toBe(2);
    expect(workflowStarts.calls).toHaveLength(1);
  });

  it("rejects the whole plan when the Outline moved since it was drawn", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER);
    const planId = await proposeThree(courseId, ["accepted", "accepted", "accepted"]);

    /* A manual edit moves the Outline to version 2 while the plan pends. */
    const manual = await applyOutlineOpAction(courseId, 1, {
      kind: "renameModule",
      moduleId: "m1",
      title: "Module one, renamed",
    });
    expect(manual.ok).toBe(true);

    const result = await applyPlanToOutlineAction(courseId, planId);
    expect(result).toMatchObject({ ok: false, reason: "conflict" });

    /* Nothing was applied: the Outline is exactly what the manual edit left. */
    const [outline] = await db
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version));
    expect(outline.version).toBe(2);
    expect(outline.data.modules[0].title).toBe("Module one, renamed");
    expect(outline.data.modules[0].lessons).toHaveLength(2);

    const [plan] = await db.select().from(changePlans).where(eq(changePlans.id, planId));
    expect(plan.status).toBe("proposed");
  });

  it("applies a content-only plan by bumping the version, so the specification still goes stale", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER);
    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const created = await createChangePlan(db, userId, courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Say it with tables." },
    ]);
    expect(created.ok).toBe(true);
    const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } })
      .plan;
    asOwner();
    await reviewTailorOperationAction(plan.id, plan.operations[0].id, "accepted");

    const applied = await applyPlanToOutlineAction(courseId, plan.id);
    expect(applied).toMatchObject({ ok: true, outlineVersion: 2, appliedCount: 1 });

    const [outline] = await db
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version));
    expect(outline.version).toBe(2);
    /* The shape did not change; the version did. */
    expect(outline.data).toEqual(OUTLINE);
  });

  it("refuses to apply a plan with nothing accepted", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER);
    const planId = await proposeThree(courseId, ["discarded", "discarded", "discarded"]);

    const result = await applyPlanToOutlineAction(courseId, planId);
    expect(result).toMatchObject({ ok: false, reason: "nothing-accepted" });
    const [outline] = await db
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version));
    expect(outline.version).toBe(1);
  });

  it("refuses another Learner's plan and a plan already applied", async () => {
    const courseId = await seedAwaitingApproval(OWNER);
    const planId = await proposeThree(courseId, ["accepted", "discarded", "accepted"]);

    headerState.current = new Headers({ cookie: otherCookie });
    const stranger = await applyPlanToOutlineAction(courseId, planId);
    expect(stranger).toMatchObject({ ok: false, reason: "not-found" });

    asOwner();
    const first = await applyPlanToOutlineAction(courseId, planId);
    expect(first.ok).toBe(true);
    const second = await applyPlanToOutlineAction(courseId, planId);
    expect(second).toMatchObject({ ok: false, reason: "not-reviewable" });
  });
});
