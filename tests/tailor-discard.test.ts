import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
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

const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");
const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const { changePlans, courses, generationRuns, outlines, users } = await import("@/lib/db/schema");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { publishRevision, currentRevision } = await import("@/lib/db/review");
const { failGenerationRun } = await import("@/lib/db/outline");
const { createChangePlan, stagePlanRevision } = await import("@/lib/db/tailor");
const { reviewTailorOperationAction, discardStagedRevisionAction } =
  await import("@/lib/actions/tailor");
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
      lessons: [{ id: "l3", ordinal: 3, title: "Lesson three", summary: "Third.", minutes: 20 }],
    },
  ],
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
  const { courseSpecs } = await import("@/lib/db/schema");
  await db.insert(courseSpecs).values({
    courseId: course.id,
    outlineVersion: 1,
    spec: {
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
      alignment: OUTLINE.modules
        .flatMap((m) => m.lessons)
        .map((l) => ({
          lessonId: l.id,
          performance: "does",
          prerequisiteNodes: [],
          moduleMilestone: "m",
          exerciseContribution: "c",
        })),
      finalExercise: { task: "Paint it", acceptanceChecks: ["It holds"] },
      evidence: [],
    },
  });
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
  const { reviewRuns } = await import("@/lib/db/schema");
  const [review] = await db
    .insert(reviewRuns)
    .values({ courseId: course.id, outlineVersion: 1, status: "succeeded" })
    .returning();
  const published = await publishRevision(db, course.id, 1, review.id);
  expect(published.ok).toBe(true);
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

async function stage(courseId: string, planId: string): Promise<string> {
  const staged = await stagePlanRevision(db, await userIdOf(OWNER), courseId, planId);
  expect(staged.ok).toBe(true);
  return (staged as { ok: true; runId: string }).runId;
}

describe("discarding a staged revision", () => {
  it("supersedes a failed plan, leaves the Course on duty, and lets a fresh plan stage", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    const runId = await stage(courseId, planId);

    await failGenerationRun(db, courseId, runId, "The model refused.", {
      touchCourse: false,
    });

    headerState.current = new Headers({ cookie: ownerCookie });
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
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);
    const runId = await stage(courseId, planId);

    headerState.current = new Headers({ cookie: ownerCookie });
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
    const courseId = await seedPublishedCourse(OWNER);
    const planId = await proposeAndAccept(courseId, [
      { kind: "lessonProse", lessonId: "l1", instruction: "Lead with the water-to-pigment ratio." },
    ]);

    headerState.current = new Headers({ cookie: ownerCookie });
    const refused = await discardStagedRevisionAction(courseId, planId);
    expect(refused).toMatchObject({ ok: false, reason: "not-discardable" });
  });
});
