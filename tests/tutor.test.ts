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

const { db } = await import("@/lib/db");
const { courses, lessons, outlines, revisions, tutorConversations, tutorMessages, users } =
  await import("@/lib/db/schema");
const { parseLessonContent } = await import("@/lib/course/content");
const { loadTutorHistory } = await import("@/lib/db/tutor");
const { signInWithGoogle } = await import("./helpers/auth");
const { setRequestCookie } = await import("./helpers/request-context");
const { makeOutline, makeSpec } = await import("./helpers/fixtures");
const { OWNER, seedPublishedCourse } = await import("./helpers/published-course");
const { streamingModel } = await import("./helpers/fake-model");
const { POST } = await import("@/app/api/courses/[courseId]/tutor/route");

const ORIGIN = "http://localhost:3000";

const OUTLINE = makeOutline([2]);
const SPEC = makeSpec(OUTLINE);

function seedCourse(ownerEmail: string): Promise<string> {
  return seedPublishedCourse({
    ownerEmail,
    outline: OUTLINE,
    spec: SPEC,
    source: {
      ref: "s1",
      title: "Postgres window docs",
      url: "https://example.com/windows",
      excerpt: "A window function computes across rows.",
    },
    content: (l) =>
      parseLessonContent(l.id, l.title, {
        body: [{ kind: "p", text: "The window does not fold." }],
        workedExample: [{ kind: "code", language: "sql", code: "select 1" }],
        recallPrompt: "r",
        selfExplanationPrompt: "s",
        exercise: { task: "t", check: "c" },
        bridge: "b",
      }),
  });
}

async function turn(
  cookie: string,
  courseId: string,
  lessonId: string,
  message: string,
): Promise<{ status: number; text: string }> {
  /* next/headers resolves the route's cookies from the request. */
  setRequestCookie(cookie || null);
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

let ownerCookie = "";

beforeEach(async () => {
  setRequestCookie(null);
  ownerCookie = await signInWithGoogle(OWNER);
  tutorModelState.current = streamingModel([
    "Both split rows, but GROUP BY folds each group while PARTITION BY keeps every row.",
  ]);
});

afterEach(async () => {
  await db.delete(users);
  setRequestCookie(null);
});

describe("a completed turn", () => {
  it("streams the answer and stores both sides with stable identities", async () => {
    const courseId = await seedCourse(OWNER);
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
    const courseId = await seedCourse(OWNER);
    await turn(ownerCookie, courseId, "l1", "Is PARTITION BY just GROUP BY?");

    const prompt = tutorModelState.current!.prompts[0];
    expect(prompt).toContain("Lesson one");
    expect(prompt).toContain("The window does not fold.");
    expect(prompt).toContain("Module one");
    expect(prompt).toContain("window functions in SQL");
    expect(prompt).toContain("Postgres window docs");
    expect(prompt).toContain("Is PARTITION BY just GROUP BY?");
    await turn(ownerCookie, courseId, "l1", "And WHERE?");
    const secondPrompt = tutorModelState.current!.prompts[1];
    expect(secondPrompt).toContain("PARTITION BY keeps every row");
  });

  it("changes nothing in the Course", async () => {
    const courseId = await seedCourse(OWNER);
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
    const courseId = await seedCourse(OWNER);

    tutorModelState.current = streamingModel([{ error: true }]);
    const failed = await turn(ownerCookie, courseId, "l1", "Why did my totals change?");
    expect(failed.text).toBe("");
    expect(
      (await db.select().from(tutorConversations).where(eq(tutorConversations.courseId, courseId)))
        .length,
    ).toBe(0);
    expect((await db.select().from(tutorMessages)).length).toBe(0);

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
    const courseId = await seedCourse(OWNER);
    await turn(ownerCookie, courseId, "l1", "First question?");
    await turn(ownerCookie, courseId, "l2", "Second Lesson question?");

    setRequestCookie(null);
    ownerCookie = await signInWithGoogle(OWNER);
    setRequestCookie(ownerCookie);

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
  it("refuses a Lesson the published Course does not have", async () => {
    const courseId = await seedCourse(OWNER);
    const response = await turn(ownerCookie, courseId, "l-ghost", "Hello?");
    expect(response.status).toBe(409);
    expect((await db.select().from(tutorMessages)).length).toBe(0);
  });
});
