import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

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

/* The durable run itself is proven in course-design.test.ts; here the engine is a stub. */
const workflowStarts = vi.hoisted(() => ({ calls: [] as { courseId: string; runId: string }[] }));
vi.mock("workflow/api", () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    const [courseId, runId] = args as [string, string];
    workflowStarts.calls.push({ courseId, runId });
    return { runId: `wrun_${workflowStarts.calls.length}` };
  },
}));

const { auth, requireLearner } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const { courses, designRuns } = await import("@/lib/db/schema");
const { createCourseAction, retryCourseAction } = await import("@/lib/actions/courses");
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

const valid = {
  topic: "the Vercel AI SDK",
  goal: "build my own AI chat app",
  background: "I know React.",
  language: "en",
  depth: "reach",
  grounding: true,
};

const str = (n: number): string => "x".repeat(n);

beforeEach(() => {
  headerState.current = new Headers();
  workflowStarts.calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCourseAction", () => {
  it("sends a signed-out visitor to sign in", async () => {
    await expect(createCourseAction(valid)).rejects.toThrow("NEXT_REDIRECT:/");
    expect(workflowStarts.calls).toHaveLength(0);
  });

  it("creates an owned Course, a design run, and hands design to Workflow", async () => {
    const cookie = await signInWithGoogle("creator@example.com");
    headerState.current = new Headers({ cookie });
    const session = await requireLearner();

    const result = await createCourseAction(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, result.courseId))
      .limit(1);
    expect(course).toBeDefined();
    expect(course.ownerId).toBe(session.user.id);
    expect(course.status).toBe("designing");
    expect(course.grounding).toBe(true);
    expect(course.language).toBe("en");
    expect(course.depth).toBe("reach");

    const [run] = await db
      .select()
      .from(designRuns)
      .where(eq(designRuns.courseId, course.id))
      .limit(1);
    expect(run.status).toBe("running");
    expect(run.workflowRunId).toBe("wrun_1");
    expect(workflowStarts.calls[0]).toEqual({ courseId: course.id, runId: run.id });
  });

  it("keeps the Course Language exactly as chosen", async () => {
    const cookie = await signInWithGoogle("deutsch@example.com");
    headerState.current = new Headers({ cookie });

    const result = await createCourseAction({ ...valid, language: "de" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, result.courseId))
      .limit(1);
    expect(course.language).toBe("de");
  });

  it("records Grounding turned off", async () => {
    const cookie = await signInWithGoogle("offline@example.com");
    headerState.current = new Headers({ cookie });

    const result = await createCourseAction({ ...valid, grounding: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, result.courseId))
      .limit(1);
    expect(course.grounding).toBe(false);
  });

  it("rejects out-of-limit input without creating anything", async () => {
    const cookie = await signInWithGoogle("careless@example.com");
    headerState.current = new Headers({ cookie });

    const result = await createCourseAction({
      ...valid,
      topic: str(201),
      language: "klingon",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.topic).toContain("200");
    expect(result.errors.language).toBeTruthy();
    expect(workflowStarts.calls).toHaveLength(0);

    const mine = await db
      .select()
      .from(courses)
      .where(eq(courses.ownerId, "sub-careless@example.com"));
    expect(mine).toHaveLength(0);
  });

  it("rejects an empty Goal", async () => {
    const cookie = await signInWithGoogle("aimless@example.com");
    headerState.current = new Headers({ cookie });

    const result = await createCourseAction({ ...valid, goal: "   " });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.goal).toBeTruthy();
    expect(workflowStarts.calls).toHaveLength(0);
  });
});

describe("retryCourseAction", () => {
  it("reads another Learner's Course as not-found", async () => {
    const cookie = await signInWithGoogle("stranger@example.com");
    headerState.current = new Headers({ cookie });

    const result = await retryCourseAction("00000000-0000-0000-0000-000000000000");
    expect(result.ok).toBe(false);
    expect(workflowStarts.calls).toHaveLength(0);
  });

  it("starts design again over a failed Course", async () => {
    const cookie = await signInWithGoogle("retrying@example.com");
    headerState.current = new Headers({ cookie });

    const created = await createCourseAction(valid);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const courseId = created.courseId;

    await db.update(courses).set({ status: "failed" }).where(eq(courses.id, courseId));

    const before = workflowStarts.calls.length;
    const result = await retryCourseAction(courseId);
    expect(result.ok).toBe(true);

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    expect(course.status).toBe("designing");

    const runs = await db.select().from(designRuns).where(eq(designRuns.courseId, courseId));
    expect(runs).toHaveLength(2);
    expect(workflowStarts.calls.length).toBe(before + 1);
    expect(workflowStarts.calls.at(-1)?.courseId).toBe(courseId);
  });
});
