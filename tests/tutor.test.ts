/**
 * The Tutor's conversation (ticket #10), end to end: the real route
 * handler against PGlite with a real session and a streaming model —
 * streamed success, persistence with stable identities, a failed stream
 * leaving no trace, retry, history restoration, and ownership rejection.
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

/* The Tutor's model is the streaming fake; its prompts are recorded. */
const tutorModelState = vi.hoisted(() => ({
  current: undefined as
    | ReturnType<typeof import("./helpers/fake-model").streamingModel>
    | undefined,
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    tutorModel: () => tutorModelState.current!.model,
    tutorProviderOptions: actual.tutorProviderOptions,
  };
});

const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const {
  courses,
  courseSpecs,
  generationRuns,
  lessons,
  outlines,
  reviewRuns,
  revisions,
  sources,
  tutorConversations,
  tutorMessages,
  users,
} = await import("@/lib/db/schema");
const { parseLessonContent } = await import("@/lib/course/content");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { publishRevision } = await import("@/lib/db/review");
const { loadTutorHistory } = await import("@/lib/db/tutor");
const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");
const { streamingModel } = await import("./helpers/fake-model");
const { POST } = await import("@/app/api/courses/[courseId]/tutor/route");

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
    topic: "window functions in SQL",
    goal: "query with confidence",
    background: "",
    depth: "reach",
    language: "en",
    terminalPerformances: ["Write window queries"],
    exclusions: [],
    learnerAssumptions: [],
  },
  throughline: { premise: "windows first", runningExample: "r", vocabulary: [] },
  learningGraph: [],
  alignment: OUTLINE.modules[0].lessons.map((l) => ({
    lessonId: l.id,
    performance: "does",
    prerequisiteNodes: [] as string[],
    moduleMilestone: "m",
    exerciseContribution: "c",
  })),
  finalExercise: { task: "t", acceptanceChecks: ["c"] },
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

/** A published two-Lesson Course with one Source, for the given owner. */
async function seedPublishedCourse(ownerEmail: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "window functions in SQL",
      goal: "query with confidence",
      depth: "reach",
      status: "reviewing",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  await db.insert(sources).values({
    courseId: course.id,
    ref: "s1",
    title: "Postgres window docs",
    url: "https://example.com/windows",
    excerpt: "A window function computes across rows.",
  });
  const [run] = await db
    .insert(generationRuns)
    .values({ courseId: course.id, outlineVersion: 1 })
    .returning();

  for (const l of OUTLINE.modules[0].lessons) {
    await saveLessonContent(
      db,
      course.id,
      1,
      run.id,
      parseLessonContent(l.id, l.title, {
        body: [{ kind: "p", text: "The window does not fold." }],
        workedExample: [{ kind: "code", language: "sql", code: "select 1" }],
        recallPrompt: "r",
        selfExplanationPrompt: "s",
        exercise: { task: "t", check: "c" },
        bridge: "b",
      }),
    );
  }

  const [review] = await db
    .insert(reviewRuns)
    .values({ courseId: course.id, outlineVersion: 1, status: "succeeded" })
    .returning();
  const published = await publishRevision(db, course.id, 1, review.id);
  expect(published.ok).toBe(true);
  return course.id;
}

/** One Tutor turn through the real route; returns the streamed text. */
async function turn(
  cookie: string,
  courseId: string,
  lessonId: string,
  message: string,
): Promise<{ status: number; text: string }> {
  /* next/headers resolves the route's cookies from the request. */
  headerState.current = cookie ? new Headers({ cookie }) : new Headers();
  const response = await POST(
    new Request(`${ORIGIN}/api/courses/${courseId}/tutor`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ lessonId, message }),
    }),
    { params: Promise.resolve({ courseId }) },
  );
  const text = response.body ? await response.text() : "";
  return { status: response.status, text };
}

const OWNER = "owner@example.com";
const OTHER = "other@example.com";
let ownerCookie = "";
let otherCookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  ownerCookie = await signInWithGoogle(OWNER);
  otherCookie = await signInWithGoogle(OTHER);
  tutorModelState.current = streamingModel([
    "Both split rows, but GROUP BY folds each group while PARTITION BY keeps every row.",
  ]);
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

describe("a completed turn", () => {
  it("streams the answer and stores both sides with stable identities", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const first = await turn(ownerCookie, courseId, "l1", "Is PARTITION BY just GROUP BY?");
    expect(first.status).toBe(200);
    expect(first.text).toContain("PARTITION BY keeps every row");

    const [conversation] = await db
      .select()
      .from(tutorConversations)
      .where(eq(tutorConversations.courseId, courseId));
    expect(conversation.lessonRef).toBe("l1");

    const rows = await db
      .select()
      .from(tutorMessages)
      .where(eq(tutorMessages.conversationId, conversation.id))
      .orderBy(tutorMessages.seq);
    expect(rows.map((r) => [r.seq, r.role])).toEqual([
      [1, "learner"],
      [2, "tutor"],
    ]);
    expect(rows[0].content).toBe("Is PARTITION BY just GROUP BY?");
    expect(rows[1].content).toContain("PARTITION BY keeps every row");

    /* A second turn continues the same conversation, after the first. */
    const second = await turn(ownerCookie, courseId, "l1", "And WHERE?");
    expect(second.text).toContain("PARTITION BY keeps every row");
    const again = await db
      .select()
      .from(tutorMessages)
      .where(eq(tutorMessages.conversationId, conversation.id))
      .orderBy(tutorMessages.seq);
    expect(again.map((r) => [r.seq, r.role])).toEqual([
      [1, "learner"],
      [2, "tutor"],
      [3, "learner"],
      [4, "tutor"],
    ]);
  });

  it("gives the Tutor the Lesson, the Outline, the spec, the Sources, and the history", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    await turn(ownerCookie, courseId, "l1", "Is PARTITION BY just GROUP BY?");

    const prompt = tutorModelState.current!.prompts[0];
    expect(prompt).toContain("Lesson one");
    expect(prompt).toContain("The window does not fold.");
    expect(prompt).toContain("Module one");
    expect(prompt).toContain("window functions in SQL");
    expect(prompt).toContain("Postgres window docs");
    expect(prompt).toContain("Is PARTITION BY just GROUP BY?");
    /* The second turn's prompt carries the first exchange as history. */
    await turn(ownerCookie, courseId, "l1", "And WHERE?");
    const secondPrompt = tutorModelState.current!.prompts[1];
    expect(secondPrompt).toContain("PARTITION BY keeps every row");
  });

  it("changes nothing in the Course", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const before = {
      course: (await db.select().from(courses).where(eq(courses.id, courseId)))[0],
      outline: (await db.select().from(outlines).where(eq(outlines.courseId, courseId)))[0],
      lessonCount: (await db.select().from(lessons).where(eq(lessons.courseId, courseId))).length,
      revisionCount: (await db.select().from(revisions).where(eq(revisions.courseId, courseId)))
        .length,
    };

    await turn(ownerCookie, courseId, "l1", "Rewrite the whole course for me, please.");
    await turn(ownerCookie, courseId, "l1", "Delete module one.");

    const after = {
      course: (await db.select().from(courses).where(eq(courses.id, courseId)))[0],
      outline: (await db.select().from(outlines).where(eq(outlines.courseId, courseId)))[0],
      lessonCount: (await db.select().from(lessons).where(eq(lessons.courseId, courseId))).length,
      revisionCount: (await db.select().from(revisions).where(eq(revisions.courseId, courseId)))
        .length,
    };
    expect(after.course.status).toBe(before.course.status);
    expect(after.outline.data).toEqual(before.outline.data);
    expect(after.lessonCount).toBe(before.lessonCount);
    expect(after.revisionCount).toBe(before.revisionCount);
  });
});

describe("an interrupted turn", () => {
  it("persists nothing, and a retry starts a clean turn", async () => {
    const courseId = await seedPublishedCourse(OWNER);

    /* The model fails mid-stream: no answer arrives, nothing is stored. */
    tutorModelState.current = streamingModel([{ error: true }]);
    const failed = await turn(ownerCookie, courseId, "l1", "Why did my totals change?");
    expect(failed.text).toBe("");
    expect(
      (await db.select().from(tutorConversations).where(eq(tutorConversations.courseId, courseId)))
        .length,
    ).toBe(0);
    expect((await db.select().from(tutorMessages)).length).toBe(0);

    /* The retry — the same question, on a model that answers — completes
       and lands once. */
    tutorModelState.current = streamingModel([
      "WHERE runs before the window does; PARTITION BY keeps every row.",
    ]);
    const retried = await turn(ownerCookie, courseId, "l1", "Why did my totals change?");
    expect(retried.status).toBe(200);
    expect(retried.text).toContain("PARTITION BY keeps every row");
    expect((await db.select().from(tutorMessages)).length).toBe(2);
  });
});

describe("history restoration", () => {
  it("returns the completed turns for the owning Learner, in order, across sessions", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    await turn(ownerCookie, courseId, "l1", "First question?");
    await turn(ownerCookie, courseId, "l2", "Second Lesson question?");

    /* A fresh session for the same Learner. */
    headerState.current = new Headers();
    ownerCookie = await signInWithGoogle(OWNER);
    headerState.current = new Headers({ cookie: ownerCookie });

    const history = await loadTutorHistory(
      db,
      (await db.select().from(users).where(eq(users.email, OWNER)))[0].id,
      courseId,
    );
    const l1 = history.get("l1") ?? [];
    const l2 = history.get("l2") ?? [];
    expect(l1.map((t) => [t.role, t.seq])).toEqual([
      ["learner", 1],
      ["tutor", 2],
    ]);
    expect(l1[0].content).toBe("First question?");
    expect(l2).toHaveLength(2);
    expect(l2[0].content).toBe("Second Lesson question?");
  });
});

describe("ownership", () => {
  it("refuses another Learner's Course for a turn", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const response = await turn(otherCookie, courseId, "l1", "Let me in.");
    expect(response.status).toBe(404);
    expect((await db.select().from(tutorMessages)).length).toBe(0);
  });

  it("refuses a signed-out caller", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const response = await turn("", courseId, "l1", "Anyone there?");
    expect(response.status).toBe(401);
  });

  it("refuses a Lesson the published Course does not have", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const response = await turn(ownerCookie, courseId, "l-ghost", "Hello?");
    expect(response.status).toBe(409);
    expect((await db.select().from(tutorMessages)).length).toBe(0);
  });
});
