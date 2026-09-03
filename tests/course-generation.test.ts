/**
 * Course generation, end to end minus the network: the declared dependency
 * order, the per-Lesson Source lookup rules, the whole candidate written
 * through the same functions the Workflow steps call, and the candidate's
 * unreadability while unpublished.
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

const workflowStarts = vi.hoisted(() => ({ calls: [] as { args: unknown[] }[] }));
vi.mock("workflow/api", () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    workflowStarts.calls.push({ args });
    return { runId: `wrun_${workflowStarts.calls.length}` };
  },
}));

import { json, scriptedModel } from "./helpers/fake-model";
import { makeTestDb } from "./helpers/test-db";

const { candidateIsComplete, generateLesson, generationOrder, GenerationError, planLessonSource } =
  await import("@/lib/course/generate");
const { users, courses, outlines, courseSpecs, sources, generationRuns, lessons } =
  await import("@/lib/db/schema");
const {
  finishGeneration,
  getLessonsForVersion,
  loadGenerationContext,
  saveLessonContent,
  saveLessonSource,
} = await import("@/lib/db/lessons");

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
    background: "I know React.",
    depth: "reach",
    language: "en",
    terminalPerformances: ["Ship a chat app"],
    exclusions: [],
    learnerAssumptions: ["React"],
  },
  throughline: {
    premise: "One app, grown lesson by lesson",
    runningExample: "The chat app",
    vocabulary: ["stream"],
  },
  learningGraph: [
    { id: "g1", skill: "Stream text", requires: [], lessonId: "l1" },
    { id: "g2", skill: "Call tools", requires: ["g1"], lessonId: "l3" },
    { id: "g3", skill: "Ship it", requires: ["g2"], lessonId: "l4" },
  ],
  alignment: OUTLINE.modules.flatMap((m) =>
    m.lessons.map((l) => ({
      lessonId: l.id,
      performance: `does ${l.title}`,
      prerequisiteNodes: [] as string[],
      moduleMilestone: "milestone",
      exerciseContribution: "contributes",
    })),
  ),
  finalExercise: { task: "Build it", acceptanceChecks: ["It runs"] },
  evidence: [],
};

async function seedCourse(grounding = true): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      id: "u1",
      name: "A Learner",
      email: "a@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: "the Vercel AI SDK",
      goal: "build my own AI chat app",
      background: "I know React.",
      depth: "reach",
      grounding,
      status: "generating",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  return course.id;
}

function lessonJson(title: string): string {
  return json({
    body: [
      { kind: "p", text: `How **${title}** works.` },
      { kind: "p", text: "Grounded in the docs.", sourceRefs: ["src-1", "src-9"] },
    ],
    workedExample: [{ kind: "p", text: "Walk the chat app." }],
    recallPrompt: `What does ${title} do?`,
    selfExplanationPrompt: "Why this order?",
    exercise: { task: `Do ${title}.`, check: "It runs." },
    bridge: "Next.",
  });
}

let db: Awaited<ReturnType<typeof makeTestDb>>;

beforeEach(async () => {
  db = await makeTestDb();
});

afterEach(async () => {
  await db.delete(users);
});

describe("generationOrder", () => {
  it("orders Lessons so required skills come first, breaking ties by Outline order", () => {
    const order = generationOrder(SPEC, OUTLINE);
    const ids = order.map((l) => l.id);
    expect(ids).toEqual(["l1", "l2", "l3", "l4"]);
  });

  it("corrects an Outline whose positions contradict the dependency graph", () => {
    /* Same four Lessons, but l3 (which requires g1 from l1) is placed
       before l1. */
    const wrong = {
      modules: [
        {
          ...OUTLINE.modules[0],
          lessons: [OUTLINE.modules[1].lessons[0], OUTLINE.modules[0].lessons[1]],
        },
        {
          ...OUTLINE.modules[1],
          lessons: [OUTLINE.modules[0].lessons[0], OUTLINE.modules[1].lessons[1]],
        },
      ],
    };
    const order = generationOrder(SPEC, wrong);
    expect(order.map((l) => l.id)).toEqual(["l2", "l1", "l3", "l4"]);
  });

  it("fails loudly on a cyclic graph instead of generating a broken Course", () => {
    const cyclic = {
      ...SPEC,
      learningGraph: [
        { id: "g1", skill: "A", requires: ["g2"], lessonId: "l1" },
        { id: "g2", skill: "B", requires: ["g1"], lessonId: "l2" },
      ],
    };
    expect(() => generationOrder(cyclic, OUTLINE)).toThrow(GenerationError);
  });
});

describe("planLessonSource", () => {
  it("asks for nothing when Grounding is off, without calling the model", async () => {
    const model = scriptedModel([json({ needsSource: true, query: "nope" })]);
    const plan = await planLessonSource(
      model.model,
      { topic: "t", goal: "g", grounding: false },
      { title: "L", summary: "S" },
      [],
    );
    expect(plan).toEqual({ needsSource: false });
    expect(model.calls()).toBe(0);
  });

  it("passes a query through when the model wants one", async () => {
    const model = scriptedModel([json({ needsSource: true, query: "ai sdk v7 tools" })]);
    const plan = await planLessonSource(
      model.model,
      { topic: "t", goal: "g", grounding: true },
      { title: "L", summary: "S" },
      [],
    );
    expect(plan).toEqual({ needsSource: true, query: "ai sdk v7 tools" });
  });
});

describe("generateLesson", () => {
  it("returns all six parts and drops Source refs the Course does not have", async () => {
    const model = scriptedModel([lessonJson("Lesson one")]);
    const content = await generateLesson(model.model, {
      course: { topic: "t", goal: "g", background: "b", language: "en", depth: "reach" },
      spec: SPEC,
      lesson: { id: "l1", title: "Lesson one", summary: "First." },
      nextLesson: { title: "Lesson two" },
      priorLessons: [],
      sources: [{ ref: "src-1", title: "Docs", url: "https://example.com", excerpt: "e" }],
    });

    expect(content.lessonId).toBe("l1");
    expect(content.body).toHaveLength(2);
    expect(content.recallPrompt).toContain("Lesson one");
    expect(content.exercise.task).toContain("Lesson one");
    expect(content.bridge).toBeTruthy();
    /* src-9 is invented; src-1 survives. */
    expect((content.body[1] as { sourceRefs?: string[] }).sourceRefs).toEqual(["src-1"]);
  });

  it("fails a Lesson the specification cannot align", async () => {
    const model = scriptedModel([lessonJson("x")]);
    await expect(
      generateLesson(model.model, {
        course: { topic: "t", goal: "g", background: "", language: "en", depth: "reach" },
        spec: SPEC,
        lesson: { id: "nope", title: "No alignment", summary: "S" },
        nextLesson: null,
        priorLessons: [],
        sources: [],
      }),
    ).rejects.toThrow(GenerationError);
  });

  it("carries the learner's accepted demands into the Lesson's prompt", async () => {
    const model = scriptedModel([lessonJson("Lesson one")]);
    await generateLesson(model.model, {
      course: { topic: "t", goal: "g", background: "", language: "en", depth: "reach" },
      spec: {
        ...SPEC,
        adjustments: [
          {
            lessonId: "l1",
            prose: "Lead with the failure mode.",
            exercise: { task: "Stream by hand", check: "It prints chunks" },
          },
          { lessonId: "l2", prose: "Not this lesson." },
        ],
      },
      lesson: { id: "l1", title: "Lesson one", summary: "First." },
      nextLesson: null,
      priorLessons: [],
      sources: [],
    });

    expect(model.prompts[0]).toContain("Lead with the failure mode.");
    expect(model.prompts[0]).toContain("Stream by hand");
    expect(model.prompts[0]).not.toContain("Not this lesson.");
  });
});

describe("a full candidate", () => {
  it("writes every Lesson in dependency order through the same functions the steps call", async () => {
    const courseId = await seedCourse();
    const context = (await loadGenerationContext(db, courseId, 1))!;
    const [run] = await db
      .insert(generationRuns)
      .values({ courseId, outlineVersion: 1 })
      .returning();

    const model = scriptedModel([
      json({ needsSource: false }),
      lessonJson("Lesson one"),
      json({ needsSource: false }),
      lessonJson("Lesson two"),
      json({ needsSource: false }),
      lessonJson("Lesson three"),
      json({ needsSource: false }),
      lessonJson("Lesson four"),
    ]);

    const order = generationOrder(context.spec, context.outline.data);
    const prior: { title: string; summary: string }[] = [];
    for (const lesson of order) {
      /* The same two calls the workflow's step makes: plan the Source
         lookup (none needed here), then write. */
      await planLessonSource(
        model.model,
        context.course,
        { title: lesson.title, summary: lesson.summary },
        context.sources,
      );
      const content = await generateLesson(model.model, {
        course: context.course,
        spec: context.spec,
        lesson,
        nextLesson: order[order.indexOf(lesson) + 1] ?? null,
        priorLessons: prior,
        sources: context.sources,
      });
      await saveLessonContent(db, courseId, 1, run.id, content);
      prior.push({ title: lesson.title, summary: lesson.summary });
    }

    const finished = await finishGeneration(db, courseId, 1, run.id);
    expect(finished).toEqual({ ok: true, missing: 0 });

    const rows = await getLessonsForVersion(db, courseId, 1);
    expect(rows.map((r) => r.lessonRef)).toEqual(["l1", "l2", "l3", "l4"]);
    expect(candidateIsComplete(OUTLINE, new Set(rows.map((r) => r.lessonRef)))).toBe(true);

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("reviewing");
  });

  it("refuses to close a run over a partial candidate", async () => {
    const courseId = await seedCourse();
    const [run] = await db
      .insert(generationRuns)
      .values({ courseId, outlineVersion: 1 })
      .returning();

    const finished = await finishGeneration(db, courseId, 1, run.id);
    expect(finished.ok).toBe(false);

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("generating");
    const [record] = await db.select().from(generationRuns).where(eq(generationRuns.id, run.id));
    expect(record.status).toBe("failed");
    expect(record.error).toContain("unwritten");
  });

  it("keeps a Lesson-specific lookup out of an ungrounded Course and dedupes by URL", async () => {
    const courseId = await seedCourse(true);
    await db.insert(sources).values({
      courseId,
      ref: "src-1",
      title: "Docs",
      url: "https://example.com/docs",
      excerpt: "e",
    });

    const first = await saveLessonSource(db, courseId, {
      title: "Docs",
      url: "https://example.com/docs",
      excerpt: "same page, found again",
    });
    const second = await saveLessonSource(db, courseId, {
      title: "A new page",
      url: "https://example.com/other",
      excerpt: "new",
    });

    expect(first).toBe("src-1");
    expect(second).not.toBe("src-1");
    const rows = await db.select().from(sources).where(eq(sources.courseId, courseId));
    expect(rows).toHaveLength(2);
  });

  it("leaves an unpublished candidate without any reading path", async () => {
    /* The guarantee is structural: rows exist only under (courseId,
       outlineVersion), and every Learner-facing read (tickets #6/#8) goes
       through a published revision pointer that does not exist yet. What
       the test pins is that nothing here flips the Course to "ready". */
    const courseId = await seedCourse();
    const [run] = await db
      .insert(generationRuns)
      .values({ courseId, outlineVersion: 1 })
      .returning();
    const content = (await import("@/lib/course/content")).parseLessonContent(
      "l1",
      "Lesson one",
      JSON.parse(lessonJson("Lesson one")),
    );
    await saveLessonContent(db, courseId, 1, run.id, content);

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("generating");
    const rows = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(desc(lessons.createdAt));
    expect(rows).toHaveLength(1);
  });
});
