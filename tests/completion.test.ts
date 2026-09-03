/**
 * Completion (ticket #8), end to end: the real server action against
 * PGlite with a real session — mark, unmark, whole-Course completion,
 * persistence across sessions, and ownership isolation.
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

const { markLessonDoneAction, markLessonUndoneAction } = await import("@/lib/actions/completion");
const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const {
  completions,
  courses,
  courseSpecs,
  generationRuns,
  outlines,
  reviewRuns,
  revisions,
  users,
} = await import("@/lib/db/schema");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { publishRevision } = await import("@/lib/db/review");
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
    terminalPerformances: ["Ship"],
    exclusions: [],
    learnerAssumptions: [],
  },
  throughline: { premise: "p", runningExample: "r", vocabulary: [] },
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

/** A published two-Lesson Course for the given owner email. */
async function seedPublishedCourse(ownerEmail: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "the Vercel AI SDK",
      goal: "build my own AI chat app",
      depth: "reach",
      status: "reviewing",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  const [run] = await db
    .insert(generationRuns)
    .values({ courseId: course.id, outlineVersion: 1 })
    .returning();

  const { parseLessonContent } = await import("@/lib/course/content");
  for (const l of OUTLINE.modules[0].lessons) {
    await saveLessonContent(
      db,
      course.id,
      1,
      run.id,
      parseLessonContent(l.id, l.title, {
        body: [{ kind: "p", text: "x" }],
        workedExample: [{ kind: "p", text: "y" }],
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

const OWNER = "owner@example.com";
const OTHER = "other@example.com";
let ownerCookie = "";
let otherCookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  ownerCookie = await signInWithGoogle(OWNER);
  otherCookie = await signInWithGoogle(OTHER);
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

describe("markLessonDoneAction", () => {
  it("completes the Exercise, its Lesson, and eventually the Course", async () => {
    asOwner();
    const courseId = await seedPublishedCourse(OWNER);

    const first = await markLessonDoneAction(courseId, "l1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.doneCount).toBe(1);
    expect(first.total).toBe(2);
    expect(first.courseComplete).toBe(false);
    expect(first.stamp).toMatch(/\d+ [A-Z]{3} \d{4}/);

    const second = await markLessonDoneAction(courseId, "l2");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.doneCount).toBe(2);
    expect(second.courseComplete).toBe(true);

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.completedAt).not.toBeNull();

    const rows = await db.select().from(completions).where(eq(completions.courseId, courseId));
    expect(rows.map((r) => r.lessonRef).sort()).toEqual(["l1", "l2"]);
  });

  it("marks are idempotent: marking twice keeps one completion and its first day", async () => {
    asOwner();
    const courseId = await seedPublishedCourse(OWNER);

    const first = await markLessonDoneAction(courseId, "l1");
    const again = await markLessonDoneAction(courseId, "l1");
    expect(again.ok).toBe(true);
    if (again.ok && first.ok) expect(again.stamp).toBe(first.stamp);

    const rows = await db.select().from(completions).where(eq(completions.courseId, courseId));
    expect(rows).toHaveLength(1);
  });

  it("unmarking clears the Lesson and the Course's completion", async () => {
    asOwner();
    const courseId = await seedPublishedCourse(OWNER);

    await markLessonDoneAction(courseId, "l1");
    await markLessonDoneAction(courseId, "l2");
    const undone = await markLessonUndoneAction(courseId, "l2");
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.doneCount).toBe(1);
    expect(undone.courseComplete).toBe(false);

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.completedAt).toBeNull();
    const rows = await db.select().from(completions).where(eq(completions.courseId, courseId));
    expect(rows.map((r) => r.lessonRef)).toEqual(["l1"]);
  });

  it("refuses a Lesson the published Course does not have", async () => {
    asOwner();
    const courseId = await seedPublishedCourse(OWNER);
    const result = await markLessonDoneAction(courseId, "l-ghost");
    expect(result).toMatchObject({ ok: false, reason: "unknown-lesson" });
    expect(await db.select().from(completions).where(eq(completions.courseId, courseId))).toEqual(
      [],
    );
  });

  it("reads another Learner's Course as not-found and never writes to it", async () => {
    asOther();
    const courseId = await seedPublishedCourse(OWNER);
    const result = await markLessonDoneAction(courseId, "l1");
    expect(result).toMatchObject({ ok: false, reason: "not-found" });
    expect(await db.select().from(completions).where(eq(completions.courseId, courseId))).toEqual(
      [],
    );
  });

  it("refuses a Course that has not published", async () => {
    asOwner();
    const courseId = await seedPublishedCourse(OWNER);
    await db.delete(revisions).where(eq(revisions.courseId, courseId));
    const result = await markLessonDoneAction(courseId, "l1");
    expect(result).toMatchObject({ ok: false, reason: "not-published" });
  });
});

describe("persistence across sessions", () => {
  it("the reading path restores Completion for the owning Learner only", async () => {
    asOwner();
    const courseId = await seedPublishedCourse(OWNER);
    await markLessonDoneAction(courseId, "l1");

    /* A fresh session: sign in again as the same Learner. */
    headerState.current = new Headers();
    ownerCookie = await signInWithGoogle(OWNER);
    asOwner();

    const { findOwnedPublishedCourse } = await import("@/lib/db/review");
    const { toReadingCourse } = await import("@/lib/course/reading");
    const { listCompletions } = await import("@/lib/db/completion");

    const ownerUser = (await db.select().from(users).where(eq(users.email, OWNER)))[0];
    const published = await findOwnedPublishedCourse(db, ownerUser.id, courseId);
    expect(published).toBeDefined();

    const restored = toReadingCourse(
      published!.course,
      published!.outline.data,
      published!.lessonRows,
      await listCompletions(db, courseId),
    );
    const l1 = restored.modules[0].lessons.find((l) => l.id === "l1");
    const l2 = restored.modules[0].lessons.find((l) => l.id === "l2");
    expect(l1).toMatchObject({ status: "done" });
    expect(l1?.stampedOn).toMatch(/\d+ [A-Z]{3} \d{4}/);
    expect(l2).toMatchObject({ status: "set" });

    /* Another Learner's restored read has nothing done. */
    const otherUser = (await db.select().from(users).where(eq(users.email, OTHER)))[0];
    const otherRead = await findOwnedPublishedCourse(db, otherUser.id, courseId);
    expect(otherRead).toBeUndefined();
  });
});
