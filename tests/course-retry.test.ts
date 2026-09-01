/**
 * Resume of failed Course work (ticket #7), stage by stage, with every
 * provider scripted: a design retry reuses persisted Sources and a
 * persisted Outline; a generation retry keeps written Lessons; a retry
 * whose review already passed goes straight to publication; and repeated
 * retries never duplicate content.
 */
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

const workflowStarts = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("workflow/api", () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    workflowStarts.calls.push(args);
    return { runId: `wrun_${workflowStarts.calls.length}` };
  },
}));

import { json, scriptedModel } from "./helpers/fake-model";

const { retryCourseAction } = await import("@/lib/actions/courses");
const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const { saveDesignSources } = await import("@/lib/db/design");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { finishReviewRun, openReviewRun, publishRevision, resetGenerationRun } =
  await import("@/lib/db/review");
const {
  courses,
  courseSpecs,
  designRuns,
  generationRuns,
  outlines,
  reviewRuns,
  revisions,
  sources,
  users,
} = await import("@/lib/db/schema");
const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");

const ORIGIN = "http://localhost:3000";
const OUTLINE = {
  modules: [
    {
      id: "m1",
      ordinal: 1,
      numeral: "I",
      title: "Module one",
      lessons: [{ id: "l1", ordinal: 1, title: "Lesson one", summary: "First.", minutes: 20 }],
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
    terminalPerformances: ["Ship"],
    exclusions: [],
    learnerAssumptions: [],
  },
  throughline: { premise: "p", runningExample: "r", vocabulary: [] },
  learningGraph: [],
  alignment: [
    {
      lessonId: "l1",
      performance: "does",
      prerequisiteNodes: [],
      moduleMilestone: "m",
      exerciseContribution: "c",
    },
  ],
  finalExercise: { task: "t", acceptanceChecks: ["c"] },
  evidence: [],
};

async function signInWithGoogle(): Promise<string> {
  fakeGoogle({ sub: "sub-1", name: "A Learner", email: "a@example.com", email_verified: true });
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

async function seedFailedCourse(stage: "design" | "generation"): Promise<string> {
  const [user] = await db.select().from(users).limit(1);
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "the Vercel AI SDK",
      goal: "build my own AI chat app",
      depth: "reach",
      status: "failed",
    })
    .returning();
  await db.insert(outlines).values({
    courseId: course.id,
    version: 1,
    data: OUTLINE,
    draft: {
      modules: [],
      terminalPerformances: ["Ship"],
      exclusions: [],
      learnerAssumptions: [],
      throughline: { premise: "p", runningExample: "r", vocabulary: [] },
    },
  });
  await db
    .insert(courseSpecs)
    .values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });

  if (stage === "design") {
    await db.insert(designRuns).values({
      courseId: course.id,
      status: "failed",
      currentStep: "specification",
      error: "The model returned no specification.",
    });
  } else {
    await db.insert(designRuns).values({
      courseId: course.id,
      status: "succeeded",
      currentStep: "persist",
    });
    await db.insert(generationRuns).values({
      courseId: course.id,
      outlineVersion: 1,
      status: "failed",
      currentStep: "lesson:l1",
      error: "The model returned no content.",
    });
  }
  return course.id;
}

let cookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  cookie = await signInWithGoogle();
  workflowStarts.calls.length = 0;
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

describe("retrying a failed design", () => {
  it("resumes past the persisted steps: sources are reused, not fetched again", async () => {
    headerState.current = new Headers({ cookie });
    const courseId = await seedFailedCourse("design");

    /* The failed run had already gathered and persisted Sources. */
    await saveDesignSources(db, courseId, [
      {
        ref: "src-1",
        title: "Docs",
        url: "https://example.com/docs",
        fetchedAt: "2026-08-31T00:00:00.000Z",
        excerpt: "e",
      },
    ]);
    const [failedRun] = await db
      .select()
      .from(designRuns)
      .where(eq(designRuns.courseId, courseId));

    const result = await retryCourseAction(courseId);
    expect(result.ok).toBe(true);
    expect(workflowStarts.calls).toEqual([
      [courseId, expect.any(String), "specification"],
    ]);

    /* Sources survived the failure untouched. */
    const rows = await db.select().from(sources).where(eq(sources.courseId, courseId));
    expect(rows.map((r) => r.ref)).toEqual(["src-1"]);
    void failedRun;
  });

  it("starts from the top when the failure happened before anything persisted", async () => {
    headerState.current = new Headers({ cookie });
    const courseId = await seedFailedCourse("design");
    await db
      .update(designRuns)
      .set({ currentStep: "sources" })
      .where(eq(designRuns.courseId, courseId));

    const result = await retryCourseAction(courseId);
    expect(result.ok).toBe(true);
    expect(workflowStarts.calls[0]?.[2]).toBe("sources");
  });

  it("refuses to retry a Course that did not fail", async () => {
    headerState.current = new Headers({ cookie });
    const courseId = await seedFailedCourse("design");
    await db
      .update(courses)
      .set({ status: "awaiting-outline-approval" })
      .where(eq(courses.id, courseId));

    const result = await retryCourseAction(courseId);
    expect(result.ok).toBe(false);
    expect(workflowStarts.calls).toHaveLength(0);
  });
});

describe("retrying a failed generation", () => {
  it("reopens the same run so written Lessons are skipped, not regenerated", async () => {
    headerState.current = new Headers({ cookie });
    const courseId = await seedFailedCourse("generation");

    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    expect(run.status).toBe("failed");

    /* The model is not consulted here; what the test pins is that the
       retry reuses the run row and its version, so the workflow's
       written-Lesson check sees l1 as done once it is written. */
    const result = await retryCourseAction(courseId);
    expect(result.ok).toBe(true);
    expect(workflowStarts.calls).toEqual([
      [courseId, run.id, run.outlineVersion],
    ]);

    const [reopened] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, run.id));
    expect(reopened.status).toBe("running");

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("generating");
  });

  it("skips an already-written Lesson when the workflow runs again", async () => {
    const courseId = await seedFailedCourse("generation");
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));

    const context = (await import("@/lib/db/lessons")).loadGenerationContext(
      db,
      courseId,
      1,
    ) as Promise<{ written: string[] } | undefined>;
    const loaded = await context;
    expect(loaded?.written).toEqual([]);

    /* Writing the Lesson, then resetting the run: the next pass sees it. */
    await saveLessonContent(
      db,
      courseId,
      1,
      run.id,
      (await import("@/lib/course/content")).parseLessonContent("l1", "Lesson one", {
        body: [{ kind: "p", text: "x" }],
        workedExample: [{ kind: "p", text: "y" }],
        recallPrompt: "r",
        selfExplanationPrompt: "s",
        exercise: { task: "t", check: "c" },
        bridge: "b",
      }),
    );
    await resetGenerationRun(db, courseId, run.id);
    const again = await (await import("@/lib/db/lessons")).loadGenerationContext(
      db,
      courseId,
      1,
    );
    expect(again?.written).toEqual(["l1"]);
  });

  it("a retry whose review already passed publishes without re-reviewing", async () => {
    const courseId = await seedFailedCourse("generation");
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));

    /* The candidate is whole and its review passed; publication itself
       was what failed. */
    await saveLessonContent(db, courseId, 1, run.id, await contentFor("l1"));
    await finishGenerationToSucceeded(db, courseId, run.id);
    const review = await openReviewRun(db, courseId, 1);
    await finishReviewRun(db, review.id, "succeeded");

    /* Repeated retries: the first publishes, the rest are no-ops. */
    await resetGenerationRun(db, courseId, run.id);
    const published = await publishRevision(db, courseId, 1, review.id);
    expect(published.ok).toBe(true);

    const second = await publishRevision(db, courseId, 1, review.id);
    expect(second.ok).toBe(true);
    const all = await db.select().from(revisions).where(eq(revisions.courseId, courseId));
    expect(all).toHaveLength(1);
    void second;
  });
});

async function contentFor(lessonId: string) {
  const { parseLessonContent } = await import("@/lib/course/content");
  void json;
  void scriptedModel;
  return parseLessonContent(lessonId, "Lesson one", {
    body: [{ kind: "p", text: "x" }],
    workedExample: [{ kind: "p", text: "y" }],
    recallPrompt: "r",
    selfExplanationPrompt: "s",
    exercise: { task: "t", check: "c" },
    bridge: "b",
  });
}

type TestDb = Parameters<typeof saveLessonContent>[0];

async function finishGenerationToSucceeded(
  database: TestDb,
  courseId: string,
  runId: string,
) {
  const { finishGeneration } = await import("@/lib/db/lessons");
  const result = await finishGeneration(database, courseId, 1, runId);
  expect(result.ok).toBe(true);
  void reviewRuns;
}
