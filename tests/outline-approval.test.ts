/**
 * The Outline checkpoint end to end, minus the network: the real server
 * actions run against PGlite with a real Better Auth session, the Workflow
 * engine is a stub that records what approval handed it, and the
 * reconciliation model is a fake that re-aligns alignment rows to the
 * Outline it is given.
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
  calls: [] as { courseId: string; runId: string; outlineVersion: number }[],
}));
vi.mock("workflow/api", () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    const [courseId, runId, outlineVersion] = args as [string, string, number];
    workflowStarts.calls.push({ courseId, runId, outlineVersion });
    return { runId: `wrun_${workflowStarts.calls.length}` };
  },
}));

/* The reconciliation model, faked: the spec comes back aligned to
   whichever Outline the action passes in. */
const reconcileCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/course/reconcile", () => ({
  reconcileSpecification: async (_model: unknown, outline: { modules: { lessons: { id: string }[] }[] }, previous: { alignment: unknown[] }) => {
    reconcileCalls.count += 1;
    return {
      ...previous,
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
const { courses, courseSpecs, generationRuns, outlines, users } = await import(
  "@/lib/db/schema"
);
const { applyOutlineOpAction, approveOutlineAction } = await import(
  "@/lib/actions/outline"
);
const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");

const ORIGIN = "http://localhost:3000";

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
  expect(callback.status).toBe(302);
  return cookieHeader(callback);
}

const OWNER_EMAIL = "owner@example.com";
const OTHER_EMAIL = "other@example.com";

/** The shape the tests start from: two Modules of two Lessons. */
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
        { id: "l4", ordinal: 4, title: "Lesson four", summary: "Fourth.", minutes: 20 },
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
  learningGraph: [
    { id: "g1", skill: "Stream text", requires: [], lessonId: "l1" },
  ],
  alignment: OUTLINE.modules.flatMap((m) =>
    m.lessons.map((l) => ({
      lessonId: l.id,
      performance: "does the thing",
      prerequisiteNodes: [],
      moduleMilestone: "milestone",
      exerciseContribution: "contributes",
    })),
  ),
  finalExercise: { task: "Build it", acceptanceChecks: ["It runs"] },
  evidence: [],
};

async function seedAwaitingApproval(ownerEmail: string): Promise<string> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
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
  await db
    .insert(courseSpecs)
    .values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  return course.id;
}

let ownerCookie = "";
let otherCookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  ownerCookie = await signInWithGoogle(OWNER_EMAIL);
  otherCookie = await signInWithGoogle(OTHER_EMAIL);
  workflowStarts.calls.length = 0;
  reconcileCalls.count = 0;
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

function asOwner() {
  headerState.current = new Headers({ cookie: ownerCookie });
}
function asOther() {
  headerState.current = new Headers({ cookie: otherCookie });
}

describe("applyOutlineOpAction", () => {
  it("applies a change as a new Outline version and marks the specification stale", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);

    const result = await applyOutlineOpAction(courseId, 1, {
      kind: "renameLesson",
      lessonId: "l1",
      title: "Renamed",
      summary: "First.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.outline.version).toBe(2);
    expect(result.outline.data.modules[0].lessons[0].title).toBe("Renamed");

    const [spec] = await db
      .select()
      .from(courseSpecs)
      .where(eq(courseSpecs.courseId, courseId));
    expect(spec.outlineVersion).toBe(1);
  });

  it("rejects a change made against an older version without applying any of it", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);

    const first = await applyOutlineOpAction(courseId, 1, {
      kind: "renameModule",
      moduleId: "m1",
      title: "Moved on",
    });
    expect(first.ok).toBe(true);

    const stale = await applyOutlineOpAction(courseId, 1, {
      kind: "renameModule",
      moduleId: "m2",
      title: "Based on the old shape",
    });
    expect(stale).toMatchObject({ ok: false, reason: "conflict" });

    const [current] = await db
      .select()
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version));
    const all = await db.select().from(outlines).where(eq(outlines.courseId, courseId));
    expect(all).toHaveLength(2);
    expect(current.version).toBe(2);
  });

  it("keeps another Learner out of the Course entirely", async () => {
    asOther();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);
    const result = await applyOutlineOpAction(courseId, 1, {
      kind: "renameModule",
      moduleId: "m1",
      title: "Mine now",
    });
    expect(result).toMatchObject({ ok: false, reason: "not-found" });
  });

  it("rejects a shape change once the Course left the checkpoint", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);
    await db
      .update(courses)
      .set({ status: "ready" })
      .where(eq(courses.id, courseId));

    const result = await applyOutlineOpAction(courseId, 1, {
      kind: "removeLesson",
      lessonId: "l1",
    });
    expect(result).toMatchObject({ ok: false, reason: "not-editable" });
  });

  it("rejects an operation the grammar does not know", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);
    const result = await applyOutlineOpAction(courseId, 1, {
      kind: "teleportLesson",
      lessonId: "l1",
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("approveOutlineAction", () => {
  it("reconciles a stale specification, pins the run to the current version, and starts generating", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);

    /* A manual change made the spec stale. */
    const changed = await applyOutlineOpAction(courseId, 1, {
      kind: "renameLesson",
      lessonId: "l1",
      title: "Renamed",
      summary: "First.",
    });
    expect(changed.ok).toBe(true);

    const result = await approveOutlineAction(courseId, 2);
    expect(result).toEqual({ ok: true, duplicate: false });
    expect(reconcileCalls.count).toBe(1);

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("generating");

    const [spec] = await db
      .select()
      .from(courseSpecs)
      .where(eq(courseSpecs.courseId, courseId));
    expect(spec.outlineVersion).toBe(2);
    expect(spec.spec.alignment.map((a) => a.lessonId)).toEqual(["l1", "l2", "l3", "l4"]);

    const runs = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    expect(runs).toHaveLength(1);
    expect(runs[0].outlineVersion).toBe(2);
    expect(workflowStarts.calls).toEqual([
      { courseId, runId: runs[0].id, outlineVersion: 2 },
    ]);
  });

  it("approves without reconciling when the specification already fits", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);

    const result = await approveOutlineAction(courseId, 1);
    expect(result).toEqual({ ok: true, duplicate: false });
    expect(reconcileCalls.count).toBe(0);

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("generating");
  });

  it("treats a second approval as a no-op instead of a second run", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);

    expect(await approveOutlineAction(courseId, 1)).toEqual({
      ok: true,
      duplicate: false,
    });
    expect(await approveOutlineAction(courseId, 1)).toEqual({ ok: true, duplicate: true });

    const runs = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    expect(runs).toHaveLength(1);
    expect(workflowStarts.calls).toHaveLength(1);
  });

  it("refuses to approve a version the Learner is not looking at", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);
    const changed = await applyOutlineOpAction(courseId, 1, {
      kind: "renameModule",
      moduleId: "m1",
      title: "Newer",
    });
    expect(changed.ok).toBe(true);

    const result = await approveOutlineAction(courseId, 1);
    expect(result).toMatchObject({ ok: false, reason: "conflict" });

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("awaiting-outline-approval");
    expect(workflowStarts.calls).toHaveLength(0);
  });

  it("does not approve an Outline with an empty Module", async () => {
    asOwner();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);
    await db.insert(outlines).values({
      courseId,
      version: 2,
      data: {
        modules: [OUTLINE.modules[0], { ...OUTLINE.modules[1], lessons: [] }],
      },
    });

    const result = await approveOutlineAction(courseId, 2);
    expect(result).toMatchObject({ ok: false, reason: "invalid" });

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("awaiting-outline-approval");
  });

  it("reads another Learner's Course as not-found", async () => {
    asOther();
    const courseId = await seedAwaitingApproval(OWNER_EMAIL);
    const result = await approveOutlineAction(courseId, 1);
    expect(result).toMatchObject({ ok: false, reason: "not-found" });
    expect(workflowStarts.calls).toHaveLength(0);
  });
});
