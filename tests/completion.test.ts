import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

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

const { markLessonDoneAction, markLessonUndoneAction } = await import("@/lib/actions/completion");
const { db } = await import("@/lib/db");
const { completions, courses, revisions, users } = await import("@/lib/db/schema");
const { parseLessonContent } = await import("@/lib/course/content");
const { signInWithGoogle } = await import("./helpers/auth");
const { setRequestCookie } = await import("./helpers/request-context");
const { makeOutline, makeSpec } = await import("./helpers/fixtures");
const { OWNER, OTHER, seedPublishedCourse } = await import("./helpers/published-course");

const OUTLINE = makeOutline([2]);

const SPEC = makeSpec(OUTLINE, {
  topic: "the Vercel AI SDK",
  goal: "build my own AI chat app",
  terminalPerformances: ["Ship"],
  throughline: { premise: "p", runningExample: "r", vocabulary: [] },
});

function seedCourse(ownerEmail: string): Promise<string> {
  return seedPublishedCourse({
    ownerEmail,
    outline: OUTLINE,
    spec: SPEC,
    content: (l) =>
      parseLessonContent(l.id, l.title, {
        body: [{ kind: "p", text: "x" }],
        workedExample: [{ kind: "p", text: "y" }],
        recallPrompt: "r",
        selfExplanationPrompt: "s",
        exercise: { task: "t", check: "c" },
        bridge: "b",
      }),
  });
}

let ownerCookie = "";

beforeEach(async () => {
  setRequestCookie(null);
  ownerCookie = await signInWithGoogle(OWNER);
  /* The second Learner exists for the cross-owner read at the bottom. */
  await signInWithGoogle(OTHER);
});

afterEach(async () => {
  await db.delete(users);
  setRequestCookie(null);
});

function asOwner() {
  setRequestCookie(ownerCookie);
}

describe("markLessonDoneAction", () => {
  it("completes the Exercise, its Lesson, and eventually the Course", async () => {
    asOwner();
    const courseId = await seedCourse(OWNER);

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
    const courseId = await seedCourse(OWNER);

    const first = await markLessonDoneAction(courseId, "l1");
    const again = await markLessonDoneAction(courseId, "l1");
    expect(again.ok).toBe(true);
    if (again.ok && first.ok) expect(again.stamp).toBe(first.stamp);

    const rows = await db.select().from(completions).where(eq(completions.courseId, courseId));
    expect(rows).toHaveLength(1);
  });

  it("unmarking clears the Lesson and the Course's completion", async () => {
    asOwner();
    const courseId = await seedCourse(OWNER);

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
    const courseId = await seedCourse(OWNER);
    const result = await markLessonDoneAction(courseId, "l-ghost");
    expect(result).toMatchObject({ ok: false, reason: "unknown-lesson" });
    expect(await db.select().from(completions).where(eq(completions.courseId, courseId))).toEqual(
      [],
    );
  });

  it("refuses a Course that has not published", async () => {
    asOwner();
    const courseId = await seedCourse(OWNER);
    await db.delete(revisions).where(eq(revisions.courseId, courseId));
    const result = await markLessonDoneAction(courseId, "l1");
    expect(result).toMatchObject({ ok: false, reason: "not-published" });
  });
});

describe("persistence across sessions", () => {
  it("the reading path restores Completion for the owning Learner only", async () => {
    asOwner();
    const courseId = await seedCourse(OWNER);
    await markLessonDoneAction(courseId, "l1");

    setRequestCookie(null);
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

    const otherUser = (await db.select().from(users).where(eq(users.email, OTHER)))[0];
    const otherRead = await findOwnedPublishedCourse(db, otherUser.id, courseId);
    expect(otherRead).toBeUndefined();
  });
});
