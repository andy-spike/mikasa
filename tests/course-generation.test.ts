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
import { InvalidStructuredOutput } from "@/lib/course/structured-generation";
import { makeTestDb } from "./helpers/test-db";
import { makeOutline } from "./helpers/fixtures";

const { candidateIsComplete, generateLesson, GenerationError } =
  await import("@/lib/course/generate");
const { generationOrder } = await import("@/lib/course/specification");
const { users, courses, outlines, courseSpecs, sources, generationRuns, lessons } =
  await import("@/lib/db/schema");
const {
  finishGeneration,
  getLessonContentsForVersion,
  getLessonsForVersion,
  loadGenerationContext,
  saveLessonContent,
  saveLessonSource,
} = await import("@/lib/db/lessons");

const OUTLINE = makeOutline([2, 2]);

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
      exampleStart: "",
      exampleEnd: "",
      sourceRefs: [],
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

function lessonJson(title: string, sourceRefs: string[] = []): string {
  return json({
    body: [
      { kind: "p", text: `How **${title}** works.` },
      { kind: "p", text: "Grounded in the docs.", sourceRefs },
      { kind: "p", text: "Apply it in the running example." },
    ],
    workedExample: [{ kind: "p", text: "Walk the chat app." }],
    recallPrompt: `What does ${title} do?`,
    selfExplanationPrompt: "Why this order?",
    exercise: { task: `Do ${title}.`, check: "It runs." },
    bridge: "Next.",
    contextSummary: `${title} extends the chat app.`,
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
  it("returns the Outline reading order when dependencies already match it", () => {
    const order = generationOrder(SPEC, OUTLINE);
    const ids = order.map((l) => l.id);
    expect(ids).toEqual(["l1", "l2", "l3", "l4"]);
  });

  it("fails loudly when the Outline order contradicts the dependency graph", () => {
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
    // The approved Outline is never reordered; an inconsistent graph is a
    // validation error that triggers one repair, not a silent reorder.
    expect(() => generationOrder(SPEC, wrong)).toThrow(GenerationError);
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

describe("generateLesson", () => {
  it("returns all six parts with known Source refs", async () => {
    const model = scriptedModel([lessonJson("Lesson one", ["src-1"])]);
    const content = await generateLesson(model.model, {
      course: { topic: "t", goal: "g", background: "b", language: "en", depth: "reach" },
      spec: SPEC,
      lesson: { id: "l1", title: "Lesson one", summary: "First." },
      nextLesson: { title: "Lesson two" },
      priorLessons: [],
      sources: [{ ref: "src-1", title: "Docs", url: "https://example.com", excerpt: "e" }],
    });

    expect(content.lessonId).toBe("l1");
    expect(content.body).toHaveLength(3);
    expect(content.recallPrompt).toContain("Lesson one");
    expect(content.exercise.task).toContain("Lesson one");
    expect(content.bridge).toBeTruthy();
    expect((content.body[1] as { sourceRefs?: string[] }).sourceRefs).toEqual(["src-1"]);
  });

  it("rejects a Lesson that cites a Source the Course does not have", async () => {
    const lesson = JSON.parse(lessonJson("Lesson one", ["src-1"]));
    lesson.body[1].sourceRefs.push("src-9");
    const model = scriptedModel([json(lesson)]);

    await expect(
      generateLesson(model.model, {
        course: { topic: "t", goal: "g", background: "b", language: "en", depth: "reach" },
        spec: SPEC,
        lesson: { id: "l1", title: "Lesson one", summary: "First." },
        nextLesson: { title: "Lesson two" },
        priorLessons: [],
        sources: [{ ref: "src-1", title: "Docs", url: "https://example.com", excerpt: "e" }],
      }),
    ).rejects.toThrow(GenerationError);
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

  it("rejects malformed blocks as structured model output", async () => {
    const lesson = JSON.parse(lessonJson("Lesson one"));
    lesson.body.push({ kind: "code" });
    const model = scriptedModel([json(lesson)]);

    await expect(
      generateLesson(model.model, {
        course: { topic: "t", goal: "g", background: "", language: "en", depth: "reach" },
        spec: SPEC,
        lesson: { id: "l1", title: "Lesson one", summary: "First." },
        nextLesson: null,
        priorLessons: [],
        sources: [],
      }),
    ).rejects.toBeInstanceOf(InvalidStructuredOutput);
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

  it("pins the shared example contract into the Lesson's prompt", async () => {
    const contract = "article.card > img.card-img, h2.card-title; breakpoints 300px and 500px";
    const model = scriptedModel([lessonJson("Lesson one")]);
    await generateLesson(model.model, {
      course: { topic: "t", goal: "g", background: "", language: "en", depth: "reach" },
      spec: {
        ...SPEC,
        throughline: { ...SPEC.throughline, exampleContract: contract },
      },
      lesson: { id: "l1", title: "Lesson one", summary: "First." },
      nextLesson: null,
      priorLessons: [],
      sources: [],
    });

    expect(model.prompts[0]).toContain("pinned before any Lesson was written");
    expect(model.prompts[0]).toContain(contract);
  });

  it("leaves resource-specific choices to the Lesson", async () => {
    const contract =
      "Fixed: GET /products is public; GET /orders is account-specific. Decide later: Cache-Control per endpoint.";
    const model = scriptedModel([lessonJson("Lesson one")]);
    await generateLesson(model.model, {
      course: {
        topic: "HTTP caching",
        goal: "Design a cache policy",
        background: "",
        language: "en",
        depth: "reach",
      },
      spec: { ...SPEC, throughline: { ...SPEC.throughline, exampleContract: contract } },
      lesson: { id: "l1", title: "Lesson one", summary: "First." },
      nextLesson: null,
      priorLessons: [],
      sources: [],
    });

    expect(model.prompts[0]).toContain(contract);
    expect(model.prompts[0]).toContain("do not apply one choice to every part of the example");
  });
});

describe("a full candidate", () => {
  it("repairs only an invalid private summary before saving a valid Lesson", async () => {
    const courseId = await seedCourse();
    const [run] = await db
      .insert(generationRuns)
      .values({ courseId, outlineVersion: 1 })
      .returning();
    const lesson = JSON.parse(lessonJson("Lesson one"));
    lesson.contextSummary = "word ".repeat(81);
    const model = scriptedModel([
      json(lesson),
      json({ contextSummary: "The chat app establishes StreamPanel." }),
    ]);
    const content = await generateLesson(model.model, {
      course: { topic: "t", goal: "g", background: "", language: "en", depth: "reach" },
      spec: SPEC,
      lesson: OUTLINE.modules[0].lessons[0],
      nextLesson: OUTLINE.modules[0].lessons[1],
      priorLessons: [],
      sources: [],
    });
    await saveLessonContent(db, courseId, 1, run.id, content);

    const [saved] = await getLessonContentsForVersion(db, courseId, 1);
    expect(saved.contextSummary).toBe("The chat app establishes StreamPanel.");
    expect(saved.body).toEqual(lesson.body);
    expect(model.calls()).toBe(2);
    expect(model.prompts[1]).toContain("How **Lesson one** works.");
  });

  it("fails after one unsuccessful summary-only repair", async () => {
    const lesson = JSON.parse(lessonJson("Lesson one"));
    lesson.contextSummary = { invalid: true };
    const model = scriptedModel([json(lesson), json({ contextSummary: "" })]);

    await expect(
      generateLesson(model.model, {
        course: { topic: "t", goal: "g", background: "", language: "en", depth: "reach" },
        spec: SPEC,
        lesson: OUTLINE.modules[0].lessons[0],
        nextLesson: OUTLINE.modules[0].lessons[1],
        priorLessons: [],
        sources: [],
      }),
    ).rejects.toThrow(GenerationError);
    expect(model.calls()).toBe(2);
  });

  it("passes saved summaries and only the complete previous Lesson to the next writer", async () => {
    const courseId = await seedCourse();
    const context = (await loadGenerationContext(db, courseId, 1))!;
    const [run] = await db
      .insert(generationRuns)
      .values({ courseId, outlineVersion: 1 })
      .returning();
    const first = {
      ...JSON.parse(lessonJson("Lesson one")),
      contextSummary: "The chat app adds StreamPanel in Lesson one.",
    };
    const second = {
      ...JSON.parse(lessonJson("Lesson two")),
      contextSummary: "The chat app adds ToolPanel in Lesson two.",
      bridge: "Pass ToolPanel to the next Lesson.",
    };
    const { parseLessonContent } = await import("@/lib/course/content");
    await saveLessonContent(db, courseId, 1, run.id, parseLessonContent("l1", "Lesson one", first));
    await saveLessonContent(
      db,
      courseId,
      1,
      run.id,
      parseLessonContent("l2", "Lesson two", second),
    );
    const saved = await getLessonContentsForVersion(db, courseId, 1);
    const model = scriptedModel([lessonJson("Lesson three")]);
    const { lessonGenerationContext } = await import("@/lib/course/lesson-context");
    const lessonContext = lessonGenerationContext(
      context.outline.data,
      context.outline.data.modules[1].lessons[0].id,
      saved,
    );

    await generateLesson(model.model, {
      course: context.course,
      spec: context.spec,
      ...lessonContext,
      sources: context.sources,
    });

    expect(model.prompts[0]).toContain("The chat app adds StreamPanel in Lesson one.");
    expect(model.prompts[0]).toContain("The chat app adds ToolPanel in Lesson two.");
    expect(model.prompts[0]).toContain("Pass ToolPanel to the next Lesson.");
    expect(model.prompts[0]).not.toContain("How **Lesson one** works.");
    expect(() =>
      lessonGenerationContext(
        context.outline.data,
        context.outline.data.modules[1].lessons[0].id,
        saved.slice(1),
      ),
    ).toThrow('Earlier Lesson "Lesson one" has no content.');
  });

  it("writes every Lesson in dependency order through the same functions the steps call", async () => {
    const courseId = await seedCourse();
    const context = (await loadGenerationContext(db, courseId, 1))!;
    const [run] = await db
      .insert(generationRuns)
      .values({ courseId, outlineVersion: 1 })
      .returning();

    const model = scriptedModel([
      lessonJson("Lesson one"),
      lessonJson("Lesson two"),
      lessonJson("Lesson three"),
      lessonJson("Lesson four"),
    ]);

    const order = generationOrder(context.spec, context.outline.data);
    const prior: { title: string; contextSummary: string }[] = [];
    let previousLesson: Awaited<ReturnType<typeof generateLesson>> | undefined;
    for (const lesson of order) {
      const content = await generateLesson(model.model, {
        course: context.course,
        spec: context.spec,
        lesson,
        nextLesson: order[order.indexOf(lesson) + 1] ?? null,
        priorLessons: prior,
        previousLesson,
        sources: context.sources,
      });
      await saveLessonContent(db, courseId, 1, run.id, content);
      prior.push({ title: lesson.title, contextSummary: content.contextSummary });
      previousLesson = content;
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
    /* Rows exist only under (courseId, outlineVersion); Learner reads go
       through a published revision pointer that does not exist yet, so
       nothing here flips the Course to "ready". */
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
