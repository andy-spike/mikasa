import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => headerState.current }));

const tailorModelState = vi.hoisted(() => ({
  current: undefined as
    | ReturnType<typeof import("./helpers/fake-model").streamingModel>
    | undefined,
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    designModel: () => tailorModelState.current!.model,
    designProviderOptions: actual.designProviderOptions,
  };
});

const navigation = vi.hoisted(() => ({
  redirect: (url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/navigation", () => navigation);

const { auth } = await import("@/lib/session");
const { db } = await import("@/lib/db");
const {
  changeOperations,
  changePlans,
  courses,
  courseSpecs,
  generationRuns,
  lessons,
  outlines,
  reviewRuns,
  revisions,
  tailorConversations,
  tailorMessages,
  tutorConversations,
  tutorMessages,
  users,
} = await import("@/lib/db/schema");
const { parseLessonContent } = await import("@/lib/course/content");
const { saveLessonContent } = await import("@/lib/db/lessons");
const { publishRevision } = await import("@/lib/db/review");
const { loadTailorHistory, findProposedPlan, createChangePlan } = await import("@/lib/db/tailor");
const { reviewTailorOperationAction } = await import("@/lib/actions/tailor");
const { validatePlanOps } = await import("@/lib/course/change-plan");
const { cookieHeader, fakeGoogle } = await import("./helpers/fake-google");
const { streamingModel } = await import("./helpers/fake-model");
const { POST } = await import("@/app/api/courses/[courseId]/tailor/route");

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

async function turn(
  cookie: string,
  courseId: string,
  message: string,
): Promise<{ status: number; text: string }> {
  headerState.current = cookie ? new Headers({ cookie }) : new Headers();
  const response = await POST(
    new Request(`${ORIGIN}/api/courses/${courseId}/tailor`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ message }),
    }),
    { params: Promise.resolve({ courseId }) },
  );
  const text = response.body ? await response.text() : "";
  return { status: response.status, text };
}

function planThenText(ops: unknown, text: string) {
  return [{ toolCall: { name: "proposeChangePlan", input: { ops } } }, text];
}

const OWNER = "owner@example.com";
const OTHER = "other@example.com";
let ownerCookie = "";
let otherCookie = "";

beforeEach(async () => {
  headerState.current = new Headers();
  ownerCookie = await signInWithGoogle(OWNER);
  otherCookie = await signInWithGoogle(OTHER);
  tailorModelState.current = streamingModel(["I proposed the change for your review."]);
});

afterEach(async () => {
  await db.delete(users);
  headerState.current = new Headers();
});

describe("the conversation", () => {
  it("streams the answer and keeps its own persistent history", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const first = await turn(ownerCookie, courseId, "Split the ordering Lesson for me.");
    expect(first.status).toBe(200);
    expect(first.text).toContain("proposed the change");

    const [conversation] = await db
      .select()
      .from(tailorConversations)
      .where(eq(tailorConversations.courseId, courseId));
    expect(conversation.courseId).toBe(courseId);

    const rows = await db
      .select()
      .from(tailorMessages)
      .where(eq(tailorMessages.conversationId, conversation.id))
      .orderBy(tailorMessages.seq);
    expect(rows.map((r) => [r.seq, r.role])).toEqual([
      [1, "learner"],
      [2, "tailor"],
    ]);
    expect(rows[0].content).toBe("Split the ordering Lesson for me.");

    await turn(ownerCookie, courseId, "And make the new one shorter.");
    const again = await db
      .select()
      .from(tailorMessages)
      .where(eq(tailorMessages.conversationId, conversation.id))
      .orderBy(tailorMessages.seq);
    expect(again.map((r) => r.seq)).toEqual([1, 2, 3, 4]);

    /* The Tailor's history is the Tailor's: the Tutor's tables are
       untouched by any of this. */
    expect((await db.select().from(tutorConversations)).length).toBe(0);
    expect((await db.select().from(tutorMessages)).length).toBe(0);
    const history = await loadTailorHistory(
      db,
      (await db.select().from(users).where(eq(users.email, OWNER)))[0].id,
      courseId,
    );
    expect(history.map((t) => t.role)).toEqual(["learner", "tailor", "learner", "tailor"]);
  });

  it("gives the model the Course's shape with stable ids", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    await turn(ownerCookie, courseId, "What would you rename?");

    const prompt = tailorModelState.current!.prompts[0];
    expect(prompt).toContain("m1");
    expect(prompt).toContain("Lesson one");
    expect(prompt).toContain("l2");
  });

  it("persists nothing on an interrupted turn", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    tailorModelState.current = streamingModel([{ error: true }]);
    const failed = await turn(ownerCookie, courseId, "Reshape everything.");
    expect(failed.text).toBe("");
    expect((await db.select().from(tailorMessages)).length).toBe(0);
    expect((await db.select().from(tailorConversations)).length).toBe(0);
  });

  it("refuses another Learner's Course and a signed-out caller", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    expect((await turn(otherCookie, courseId, "Hello?")).status).toBe(404);
    expect((await turn("", courseId, "Anyone there?")).status).toBe(401);
    expect((await db.select().from(tailorMessages)).length).toBe(0);
  });
});

describe("the proposal tool", () => {
  it("stores a validated plan pinned to the Course the Learner sees", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    tailorModelState.current = streamingModel(
      planThenText(
        [
          {
            kind: "renameLesson",
            lessonId: "l1",
            title: "Lesson one, renamed",
            summary: "Still first.",
          },
          {
            kind: "addLesson",
            moduleId: "m1",
            title: "Warm-up",
            summary: "Before the first proper Lesson.",
          },
        ],
        "I proposed both for your review.",
      ),
    );
    const response = await turn(
      ownerCookie,
      courseId,
      "Rename Lesson one and add a warm-up Lesson.",
    );
    expect(response.status).toBe(200);
    expect(response.text).toContain("proposed both");

    const [plan] = await db.select().from(changePlans).where(eq(changePlans.courseId, courseId));
    expect(plan.status).toBe("proposed");
    expect(plan.baseOutlineVersion).toBe(1);
    expect(plan.baseRevisionNumber).toBe(1);

    const ops = await db
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, plan.id))
      .orderBy(changeOperations.position);
    expect(ops.map((o) => o.status)).toEqual(["proposed", "proposed"]);
    expect(ops[0].payload).toEqual({
      kind: "renameLesson",
      lessonId: "l1",
      title: "Lesson one, renamed",
      summary: "Still first.",
    });
    expect(ops[1].payload).toEqual({
      kind: "addLesson",
      moduleId: "m1",
      title: "Warm-up",
      summary: "Before the first proper Lesson.",
    });
  });

  it("refuses operations the Outline cannot take, and stores no plan", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    tailorModelState.current = streamingModel(
      planThenText(
        [{ kind: "renameLesson", lessonId: "l-ghost", title: "Ghost", summary: "No." }],
        "I could not propose that.",
      ),
    );
    const response = await turn(ownerCookie, courseId, "Rename the ghost Lesson.");
    expect(response.status).toBe(200);
    expect(response.text).toContain("could not propose");
    expect((await db.select().from(changePlans)).length).toBe(0);
  });

  it("refuses a content change whose Lesson an earlier operation removed", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    tailorModelState.current = streamingModel(
      planThenText(
        [
          { kind: "removeLesson", lessonId: "l1" },
          { kind: "lessonProse", lessonId: "l1", instruction: "Rewrite it." },
        ],
        "I could not propose that.",
      ),
    );
    await turn(ownerCookie, courseId, "Remove Lesson one, then rewrite it.");
    expect((await db.select().from(changePlans)).length).toBe(0);
  });

  it("leaves the newest proposal the only one under review", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    tailorModelState.current = streamingModel(
      planThenText(
        [{ kind: "renameLesson", lessonId: "l1", title: "A", summary: "a" }],
        "Proposed.",
      ),
    );
    await turn(ownerCookie, courseId, "First idea.");
    tailorModelState.current = streamingModel(
      planThenText(
        [
          { kind: "renameLesson", lessonId: "l1", title: "B", summary: "b" },
          { kind: "renameLesson", lessonId: "l2", title: "C", summary: "c" },
        ],
        "Better idea.",
      ),
    );
    await turn(ownerCookie, courseId, "Actually, try this instead.");

    const plans = await db
      .select()
      .from(changePlans)
      .where(eq(changePlans.courseId, courseId))
      .orderBy(changePlans.createdAt);
    expect(plans.map((p) => p.status)).toEqual(["superseded", "proposed"]);

    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const underReview = await findProposedPlan(db, userId, courseId);
    expect(underReview?.operations).toHaveLength(2);
  });
});

describe("the review", () => {
  async function proposeTwo(
    userId: string,
    courseId: string,
  ): Promise<{ planId: string; first: string; second: string }> {
    const created = await createChangePlan(db, userId, courseId, [
      {
        kind: "renameLesson",
        lessonId: "l1",
        title: "Lesson one, renamed",
        summary: "Still first.",
      },
      {
        kind: "addLesson",
        moduleId: "m1",
        title: "Warm-up",
        summary: "Before the first proper Lesson.",
      },
    ]);
    expect(created.ok).toBe(true);
    const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } }).plan;
    return { planId: plan.id, first: plan.operations[0].id, second: plan.operations[1].id };
  }

  it("accepts and discards operation by operation, and restores", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const { planId, first, second } = await proposeTwo(userId, courseId);

    headerState.current = new Headers({ cookie: ownerCookie });
    expect((await reviewTailorOperationAction(planId, first, "accepted")).ok).toBe(true);
    expect((await reviewTailorOperationAction(planId, second, "discarded")).ok).toBe(true);

    const ops = await db
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, planId))
      .orderBy(changeOperations.position);
    expect(ops.map((o) => o.status)).toEqual(["accepted", "discarded"]);

    expect((await reviewTailorOperationAction(planId, first, "proposed")).ok).toBe(true);
    expect((await reviewTailorOperationAction(planId, second, "proposed")).ok).toBe(true);
    const restored = await db
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.planId, planId))
      .orderBy(changeOperations.position);
    expect(restored.map((o) => o.status)).toEqual(["proposed", "proposed"]);
  });

  it("changes nothing in the Course", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const { planId } = await proposeTwo(userId, courseId);

    const before = {
      course: (await db.select().from(courses).where(eq(courses.id, courseId)))[0],
      outlineCount: (await db.select().from(outlines).where(eq(outlines.courseId, courseId)))
        .length,
      outline: (await db.select().from(outlines).where(eq(outlines.courseId, courseId)))[0],
      lessonCount: (await db.select().from(lessons).where(eq(lessons.courseId, courseId))).length,
      revisionCount: (await db.select().from(revisions).where(eq(revisions.courseId, courseId)))
        .length,
    };

    headerState.current = new Headers({ cookie: ownerCookie });
    const plan = await findProposedPlan(db, userId, courseId);
    for (const operation of plan!.operations) {
      await reviewTailorOperationAction(planId, operation.id, "accepted");
    }

    const after = {
      course: (await db.select().from(courses).where(eq(courses.id, courseId)))[0],
      outlineCount: (await db.select().from(outlines).where(eq(outlines.courseId, courseId)))
        .length,
      outline: (await db.select().from(outlines).where(eq(outlines.courseId, courseId)))[0],
      lessonCount: (await db.select().from(lessons).where(eq(lessons.courseId, courseId))).length,
      revisionCount: (await db.select().from(revisions).where(eq(revisions.courseId, courseId)))
        .length,
    };
    expect(after.course.status).toBe(before.course.status);
    expect(after.outlineCount).toBe(before.outlineCount);
    expect(after.outline.data).toEqual(before.outline.data);
    expect(after.lessonCount).toBe(before.lessonCount);
    expect(after.revisionCount).toBe(before.revisionCount);
  });

  it("freezes a plan that is no longer under review", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const { planId, first } = await proposeTwo(userId, courseId);
    await db.update(changePlans).set({ status: "applied" }).where(eq(changePlans.id, planId));

    headerState.current = new Headers({ cookie: ownerCookie });
    const result = await reviewTailorOperationAction(planId, first, "discarded");
    expect(result.ok).toBe(false);
    const [operation] = await db
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.id, first));
    expect(operation.status).toBe("proposed");
  });

  it("refuses another Learner's plan", async () => {
    const courseId = await seedPublishedCourse(OWNER);
    const userId = (await db.select().from(users).where(eq(users.email, OWNER)))[0].id;
    const { planId, first } = await proposeTwo(userId, courseId);

    headerState.current = new Headers({ cookie: otherCookie });
    const result = await reviewTailorOperationAction(planId, first, "accepted");
    expect(result.ok).toBe(false);
    const [operation] = await db
      .select()
      .from(changeOperations)
      .where(eq(changeOperations.id, first));
    expect(operation.status).toBe("proposed");
  });
});

describe("validatePlanOps", () => {
  it("takes a content change before its Lesson is removed, not after", () => {
    expect(() =>
      validatePlanOps(OUTLINE, [
        { kind: "exercise", lessonId: "l1", task: "t", check: "c" },
        { kind: "removeLesson", lessonId: "l1" },
      ]),
    ).not.toThrow();

    expect(() =>
      validatePlanOps(OUTLINE, [
        { kind: "removeLesson", lessonId: "l1" },
        { kind: "exercise", lessonId: "l1", task: "t", check: "c" },
      ]),
    ).toThrow();
  });

  it("refuses a Module without Lessons when the plan is proposed", () => {
    /* An empty Module would pass staging but block publication, so the front
       door refuses it. */
    expect(() =>
      validatePlanOps(OUTLINE, [{ kind: "addModule", moduleId: "m2", title: "Module two" }]),
    ).toThrow(/no Lessons/);

    expect(() =>
      validatePlanOps(OUTLINE, [
        { kind: "addModule", moduleId: "m2", title: "Module two" },
        { kind: "addLesson", moduleId: "m2", title: "Lesson three", summary: "Third." },
      ]),
    ).not.toThrow();
  });
});
