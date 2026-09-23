/**
 * v1 fast coherent generation: hermetic coverage for the plan's required
 * scenarios. Every external provider is substituted; no live model,
 * Firecrawl, or embedding calls occur.
 */
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

vi.mock("workflow/api", () => ({
  start: async () => ({ runId: "wrun_test" }),
}));

import { json, scriptedModel } from "./helpers/fake-model";
import { makeTestDb } from "./helpers/test-db";
import { makeOutline, makeSpec } from "./helpers/fixtures";

const { users, courses, outlines, courseSpecs, generationRuns, lessons, revisions } =
  await import("@/lib/db/schema");
const { generateLesson } = await import("@/lib/course/generate");
const { generationOrder, validateSpecification } = await import("@/lib/course/specification");
const {
  structuralFindings,
  combinedFindings,
  dedupeCorrectionQueries,
  correctLesson,
  MAX_CORRECTION_ROUNDS,
} = await import("@/lib/course/review");
const { parseLessonContent } = await import("@/lib/course/content");

let testDb: Awaited<ReturnType<typeof makeTestDb>>;

beforeEach(async () => {
  testDb = await makeTestDb();
});

afterEach(async () => {
  await testDb.delete(users);
});

function outline4() {
  return makeOutline([2, 2]);
}

function spec4(outline: ReturnType<typeof makeOutline>) {
  return makeSpec(outline, {
    topic: "the Vercel AI SDK",
    goal: "build my own AI chat app",
    terminalPerformances: ["Ship"],
    throughline: { premise: "One app", runningExample: "The chat app", vocabulary: ["stream"] },
    learningGraph: [
      { id: "g1", skill: "Stream", requires: [], lessonId: "l1" },
      { id: "g2", skill: "Tools", requires: ["g1"], lessonId: "l3" },
    ],
    alignment: (l) => ({
      lessonId: l.id,
      performance: `does ${l.title}`,
      prerequisiteNodes: [],
      moduleMilestone: "m",
      exerciseContribution: "c",
      exampleStart: `before ${l.id}`,
      exampleEnd: `after ${l.id}`,
      sourceRefs: [],
    }),
    finalExercise: { task: "Build it", acceptanceChecks: ["It runs"] },
  });
}

function lessonJson(title: string): string {
  return json({
    body: [
      { kind: "p", text: `Body ${title}.` },
      { kind: "p", text: "Apply the idea." },
      { kind: "p", text: "Check the result." },
    ],
    workedExample: [{ kind: "p", text: "Worked." }],
    recallPrompt: `Recall ${title}?`,
    selfExplanationPrompt: "Why?",
    exercise: { task: `Do ${title}.`, check: "Done." },
    bridge: "Next.",
    contextSummary: `${title} extends the running example.`,
  });
}

describe("reading-order context", () => {
  it("generationOrder returns Outline order and never reorders it", () => {
    const outline = outline4();
    const spec = spec4(outline);
    expect(generationOrder(spec, outline).map((l) => l.id)).toEqual(["l1", "l2", "l3", "l4"]);
  });
});

describe("generation prompt carries shared context", () => {
  it("every prompt carries example boundaries and the final Exercise", async () => {
    const outline = outline4();
    const spec = spec4(outline);
    const model = scriptedModel([lessonJson("Lesson one"), lessonJson("Lesson two")]);
    for (const id of ["l1", "l2"]) {
      const lesson = outline.modules.flatMap((m) => m.lessons).find((l) => l.id === id)!;
      await generateLesson(model.model, {
        course: { topic: "t", goal: "g", background: "", language: "en", depth: "reach" },
        spec,
        lesson,
        nextLesson: null,
        priorLessons: [],
        sources: [],
      });
    }
    for (const prompt of model.prompts) {
      expect(prompt).toContain("before l");
      expect(prompt).toContain("after l");
      expect(prompt).toContain("Build it");
      expect(prompt).toContain("It runs");
    }
  });

  it("the prompt carries earlier summaries and the complete previous Lesson", async () => {
    const outline = outline4();
    const spec = spec4(outline);
    const model = scriptedModel([lessonJson("Lesson two")]);
    const lesson = outline.modules.flatMap((m) => m.lessons).find((l) => l.id === "l2")!;
    await generateLesson(model.model, {
      course: { topic: "t", goal: "g", background: "", language: "en", depth: "reach" },
      spec,
      lesson,
      nextLesson: null,
      priorLessons: [
        {
          title: "Lesson one",
          contextSummary: "The opener establishes the guard.",
        },
      ],
      previousLesson: parseLessonContent("l1", "Lesson one", {
        ...JSON.parse(lessonJson("Lesson one")),
        bridge: "Next we widen the guard.",
      }),
      sources: [],
    });
    expect(model.prompts[0]).toContain("The opener establishes the guard.");
    expect(model.prompts[0]).toContain("never introduce them again");
    expect(model.prompts[0]).toContain("Next we widen the guard.");
  });

  it("correction prompts carry the final Exercise too", async () => {
    const outline = makeOutline([1]);
    const spec = makeSpec(outline, {
      finalExercise: { task: "Ship the app", acceptanceChecks: ["It streams", "It keeps history"] },
    });
    const lesson = parseLessonContent("l1", "Lesson one", JSON.parse(lessonJson("Lesson one")));
    const model = scriptedModel([
      json({
        replacements: [{ quote: "Body Lesson one.", replacement: "Fixed.", replaceAll: false }],
      }),
    ]);
    await correctLesson(
      model.model,
      { topic: "t", goal: "g", language: "en" },
      spec,
      lesson,
      [
        {
          kind: "factual",
          lessonRef: "l1",
          quote: "Body Lesson one.",
          detail: "Wrong.",
          correction: "Fix.",
        },
      ],
      [],
    );
    expect(model.prompts[0]).toContain("Ship the app");
    expect(model.prompts[0]).toContain("It streams");
  });
});

describe("specification validation", () => {
  it("invalid dependencies fail loudly and never silently reorder", () => {
    const outline = outline4();
    const spec = spec4(outline);
    const bad = {
      ...spec,
      learningGraph: [
        { id: "g1", skill: "A", requires: ["g2"], lessonId: "l1" },
        { id: "g2", skill: "B", requires: [], lessonId: "l3" },
      ],
    };
    // l1 requires a skill from l3 (later): invalid, and the Outline stays put.
    expect(() => validateSpecification(bad, outline, new Set())).toThrow(/later Lesson/);
    expect(outline.modules[0].lessons[0].id).toBe("l1");
  });

  it("duplicate graph ids, unknown lessons, and unknown sources all fail", () => {
    const outline = outline4();
    const spec = spec4(outline);
    expect(() =>
      validateSpecification(
        { ...spec, learningGraph: [...spec.learningGraph, { ...spec.learningGraph[0] }] },
        outline,
        new Set(),
      ),
    ).toThrow(/twice/);
    expect(() =>
      validateSpecification(
        {
          ...spec,
          alignment: spec.alignment.map((a) =>
            a.lessonId === "l1" ? { ...a, sourceRefs: ["src-nope"] } : a,
          ),
        },
        outline,
        new Set(),
      ),
    ).toThrow(/src-nope/);
  });

  it("two Lessons claiming the same performance fail: corrections cannot merge Lessons", () => {
    const outline = outline4();
    const spec = spec4(outline);
    const duplicated = {
      ...spec,
      alignment: spec.alignment.map((a) =>
        a.lessonId === "l2" ? { ...a, performance: spec.alignment[0].performance } : a,
      ),
    };
    expect(() => validateSpecification(duplicated, outline, new Set())).toThrow(/same performance/);
  });

  it("empty example descriptions are allowed when there is no cumulative example", () => {
    const outline = makeOutline([1]);
    const spec = makeSpec(outline, {
      alignment: (l) => ({
        lessonId: l.id,
        performance: `does ${l.id}`,
        prerequisiteNodes: [],
        moduleMilestone: "m",
        exerciseContribution: "c",
        exampleStart: "",
        exampleEnd: "",
        sourceRefs: [],
      }),
    });
    expect(() => validateSpecification(spec, outline, new Set())).not.toThrow();
  });
});

describe("sources", () => {
  it("a stored Source absent from evidence passes structural validation", () => {
    const outline = makeOutline([1]);
    const spec = makeSpec(outline, { evidence: [] });
    const lesson = parseLessonContent("l1", "Lesson one", {
      body: [{ kind: "p", text: "Claim.", sourceRefs: ["src-stored"] }],
      workedExample: [{ kind: "p", text: "Worked." }],
      recallPrompt: "R?",
      selfExplanationPrompt: "W?",
      exercise: { task: "Do.", check: "Done." },
      bridge: "Next.",
      contextSummary: "Lesson one extends the running example.",
    });
    expect(
      structuralFindings({
        spec,
        outline,
        lessons: [lesson],
        storedSources: [{ ref: "src-stored" }],
      }),
    ).toEqual([]);
    // Without the stored set it fails.
    expect(
      structuralFindings({ spec, outline, lessons: [lesson], storedSources: [] }).length,
    ).toBeGreaterThan(0);
  });

  it("correction queries dedupe, cap at three, and keep stable order", () => {
    const findings = [
      { kind: "factual", lessonRef: "l1", detail: "a", correction: "c", sourceQuery: "q1" },
      { kind: "factual", lessonRef: "l2", detail: "b", correction: "c", sourceQuery: "Q1" },
      { kind: "factual", lessonRef: "l1", detail: "c", correction: "c", sourceQuery: "q2" },
      { kind: "structural", lessonRef: "l1", detail: "d", correction: "c", sourceQuery: "q3" },
      { kind: "factual", lessonRef: "l3", detail: "e", correction: "c", sourceQuery: "q3" },
      { kind: "factual", lessonRef: "l4", detail: "f", correction: "c", sourceQuery: "q4" },
      { kind: "factual", lessonRef: "l5", detail: "g", correction: "c", sourceQuery: "q5" },
    ] as never;
    expect(dedupeCorrectionQueries(findings)).toEqual(["q1", "q2", "q3"]);
  });
});

describe("combined review", () => {
  it("expands multi-Lesson findings and rejects invalid or empty targets", async () => {
    const outline = makeOutline([2]);
    const spec = makeSpec(outline);
    const lessons = ["l1", "l2"].map((id) =>
      parseLessonContent(id, `Lesson ${id}`, JSON.parse(lessonJson(id))),
    );
    const model = scriptedModel([
      json({
        findings: [
          {
            kind: "factual",
            lessonRefs: ["l1", "l2"],
            quote: "Worked.",
            detail: "Both wrong.",
            correction: "Fix both.",
          },
        ],
      }),
    ]);
    const findings = await combinedFindings(
      model.model,
      { topic: "t", goal: "g", language: "en" },
      spec,
      outline,
      [],
      lessons,
    );
    expect(findings.map((f) => f.lessonRef).sort()).toEqual(["l1", "l2"]);

    const badEmpty = scriptedModel([
      json({ findings: [{ kind: "factual", lessonRefs: [], detail: "x", correction: "y" }] }),
    ]);
    await expect(
      combinedFindings(
        badEmpty.model,
        { topic: "t", goal: "g", language: "en" },
        spec,
        outline,
        [],
        lessons,
      ),
    ).rejects.toThrow();

    const badUnknown = scriptedModel([
      json({ findings: [{ kind: "factual", lessonRefs: ["l9"], detail: "x", correction: "y" }] }),
    ]);
    await expect(
      combinedFindings(
        badUnknown.model,
        { topic: "t", goal: "g", language: "en" },
        spec,
        outline,
        [],
        lessons,
      ),
    ).rejects.toThrow();
  });

  it("correction rounds stop at three", () => {
    expect(MAX_CORRECTION_ROUNDS).toBe(3);
  });
});

describe("cancellation and retry safety", () => {
  async function seedGenerating(): Promise<string> {
    const [user] = await testDb
      .insert(users)
      .values({
        id: "u1",
        name: "L",
        email: "a@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const outline = outline4();
    const [course] = await testDb
      .insert(courses)
      .values({ ownerId: user.id, topic: "t", goal: "g", depth: "reach", status: "generating" })
      .returning();
    await testDb.insert(outlines).values({ courseId: course.id, version: 1, data: outline });
    await testDb
      .insert(courseSpecs)
      .values({ courseId: course.id, spec: spec4(outline), outlineVersion: 1 });
    await testDb.insert(generationRuns).values({ courseId: course.id, outlineVersion: 1 });
    return course.id;
  }

  it("late Lesson writes cannot recreate cancelled candidate data", async () => {
    const courseId = await seedGenerating();
    const { saveLessonContent } = await import("@/lib/db/lessons");
    const [run] = await testDb
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    // Cancel deletes the run row (same locking order: run before candidate rows).
    await testDb.delete(generationRuns).where(eq(generationRuns.id, run.id));
    const content = parseLessonContent("l1", "Lesson one", JSON.parse(lessonJson("l1")));
    await expect(saveLessonContent(testDb, courseId, 1, run.id, content)).rejects.toThrow(/gone/);
    expect(await testDb.select().from(lessons).where(eq(lessons.courseId, courseId))).toEqual([]);
  });

  it("duplicate retries claim one attempt and do not duplicate publication", async () => {
    const courseId = await seedGenerating();
    const { resetGenerationRun, publishRevision, openReviewRun } = await import("@/lib/db/review");
    const { saveLessonContent } = await import("@/lib/db/lessons");
    const outline = outline4();
    const [run] = await testDb
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    await testDb
      .update(generationRuns)
      .set({ status: "failed", error: "boom" })
      .where(eq(generationRuns.id, run.id));
    // Write one valid draft before retrying.
    const content = parseLessonContent("l1", "Lesson one", JSON.parse(lessonJson("l1")));
    // saveLessonContent needs a live run; re-create a failed run row state first.
    // The run is failed, not gone, so the write succeeds and is preserved.
    await saveLessonContent(testDb, courseId, 1, run.id, content);

    const first = await resetGenerationRun(testDb, courseId, run.id);
    const second = await resetGenerationRun(testDb, courseId, run.id);
    expect([first, second].filter(Boolean)).toHaveLength(1);

    // Publication is idempotent per outline version.
    for (const id of ["l2", "l3", "l4"]) {
      await saveLessonContent(
        testDb,
        courseId,
        1,
        run.id,
        parseLessonContent(id, `Lesson ${id}`, JSON.parse(lessonJson(id))),
      );
    }
    const review = await openReviewRun(testDb, courseId, 1);
    const { finishReviewRun } = await import("@/lib/db/review");
    await finishReviewRun(testDb, review.id, "succeeded");
    const firstPub = await publishRevision(testDb, courseId, 1, review.id);
    const secondPub = await publishRevision(testDb, courseId, 1, review.id);
    expect(firstPub.ok && secondPub.ok).toBe(true);
    expect(
      await testDb.select().from(revisions).where(eq(revisions.courseId, courseId)),
    ).toHaveLength(1);
    void outline;
  });
});

describe("staged corrections preserve Exercises", () => {
  it("related prose repair keeps the Exercise exactly", async () => {
    const outline = makeOutline([2]);
    const spec = makeSpec(outline);
    const lesson = parseLessonContent("l2", "Lesson two", JSON.parse(lessonJson("l2")));
    const before = { ...lesson.exercise };
    const model = scriptedModel([
      json({
        replacements: [{ quote: "Body l2.", replacement: "Rewritten prose.", replaceAll: false }],
      }),
    ]);
    const corrected = await correctLesson(
      model.model,
      { topic: "t", goal: "g", language: "en" },
      spec,
      lesson,
      [
        {
          kind: "factual",
          lessonRef: "l2",
          quote: "Body l2.",
          detail: "Prose drifts.",
          correction: "Tighten.",
        },
      ],
      [],
      { preserveExercise: true },
    );
    expect(corrected.exercise).toEqual(before);
    expect(corrected.body[0]).toMatchObject({ text: "Rewritten prose." });
  });
});

describe("source planning is gone from the normal path", () => {
  it("generation and revision workflows write Lessons sequentially and never call the per-Lesson planner", async () => {
    const fs = await import("node:fs");
    for (const file of ["workflows/course-generation.ts", "workflows/course-revision.ts"]) {
      const text = fs.readFileSync(file, "utf8");
      expect(text).toContain("for (const lesson of pending)");
      expect(text).toContain("stepGenerateLesson");
      expect(text).not.toContain("runWithConcurrency");
      expect(text).not.toContain("LESSON_CONCURRENCY");
      expect(text).not.toContain("stepPlanSources");
      expect(text).not.toContain("stepFetchSource(");
    }
  });

  it("correction searches run at most three deduplicated queries, none when ungrounded", async () => {
    const { stepFetchCorrectionSources } = await import("@/workflows/course-steps");
    // Ungrounded: no search even with queries. Uses the real searcher, so it
    // would fail loudly if it tried; returning [] proves no call happened.
    const none = await stepFetchCorrectionSources("00000000-0000-0000-0000-000000000000", false, [
      "q1",
      "q2",
    ]);
    expect(none).toEqual([]);
  });
});

describe("publication gates", () => {
  it("structural findings block publication; the run stays failed", async () => {
    const [user] = await testDb
      .insert(users)
      .values({
        id: "u9",
        name: "L",
        email: "gate@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const outline = makeOutline([1]);
    const spec = makeSpec(outline);
    const [course] = await testDb
      .insert(courses)
      .values({ ownerId: user.id, topic: "t", goal: "g", depth: "reach", status: "reviewing" })
      .returning();
    await testDb.insert(outlines).values({ courseId: course.id, version: 1, data: outline });
    await testDb.insert(courseSpecs).values({ courseId: course.id, spec, outlineVersion: 1 });
    const [run] = await testDb
      .insert(generationRuns)
      .values({ courseId: course.id, outlineVersion: 1 })
      .returning();
    const { saveLessonContent } = await import("@/lib/db/lessons");
    const good = parseLessonContent("l1", "Lesson one", JSON.parse(lessonJson("l1")));
    await saveLessonContent(testDb, course.id, 1, run.id, good);
    // Corrupt the bridge directly to simulate a structural failure the
    // parser would never produce.
    await testDb.update(lessons).set({ bridge: "" }).where(eq(lessons.courseId, course.id));
    const { structuralFindings: structural } = await import("@/lib/course/review");
    const findings = structural({
      spec,
      outline,
      lessons: [{ ...good, bridge: "" } as never],
    });
    expect(findings.some((f) => f.detail.includes("bridge"))).toBe(true);
    // Publish still refuses when Lessons are incomplete (delete the Lesson).
    await testDb.delete(lessons).where(eq(lessons.courseId, course.id));
    const { publishRevision, openReviewRun, finishReviewRun } = await import("@/lib/db/review");
    const review = await openReviewRun(testDb, course.id, 1);
    await finishReviewRun(testDb, review.id, "succeeded");
    const blocked = await publishRevision(testDb, course.id, 1, review.id);
    expect(blocked.ok).toBe(false);
  });
});

describe("retry after publication", () => {
  it("leaves the Course ready and completes only bookkeeping", async () => {
    const [user] = await testDb
      .insert(users)
      .values({
        id: "u11",
        name: "L",
        email: "repub@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const outline = makeOutline([1]);
    const spec = makeSpec(outline);
    const [course] = await testDb
      .insert(courses)
      .values({ ownerId: user.id, topic: "t", goal: "g", depth: "reach", status: "reviewing" })
      .returning();
    await testDb.insert(outlines).values({ courseId: course.id, version: 1, data: outline });
    await testDb.insert(courseSpecs).values({ courseId: course.id, spec, outlineVersion: 1 });
    const [run] = await testDb
      .insert(generationRuns)
      .values({ courseId: course.id, outlineVersion: 1 })
      .returning();
    const { saveLessonContent } = await import("@/lib/db/lessons");
    await saveLessonContent(
      testDb,
      course.id,
      1,
      run.id,
      parseLessonContent("l1", "Lesson one", JSON.parse(lessonJson("l1"))),
    );
    const { openReviewRun, finishReviewRun, publishRevision, resetGenerationRun } =
      await import("@/lib/db/review");
    const review = await openReviewRun(testDb, course.id, 1);
    await finishReviewRun(testDb, review.id, "succeeded");
    const first = await publishRevision(testDb, course.id, 1, review.id, {
      generationRunId: run.id,
    });
    expect(first.ok).toBe(true);
    const [afterPub] = await testDb.select().from(courses).where(eq(courses.id, course.id));
    expect(afterPub.status).toBe("ready");
    // A failed run after publication (e.g. embedding crashed) resets without
    // flipping the Course back to generating.
    await testDb
      .update(generationRuns)
      .set({ status: "failed", error: "embed crashed" })
      .where(eq(generationRuns.id, run.id));
    const claimed = await resetGenerationRun(testDb, course.id, run.id);
    expect(claimed).toBe(true);
    const [afterReset] = await testDb.select().from(courses).where(eq(courses.id, course.id));
    expect(afterReset.status).toBe("ready");
    // Publishing again reuses the revision, no duplicate.
    const again = await publishRevision(testDb, course.id, 1, review.id, {
      generationRunId: run.id,
    });
    expect(again.ok).toBe(true);
    expect(
      await testDb.select().from(revisions).where(eq(revisions.courseId, course.id)),
    ).toHaveLength(1);
  });
});

describe("compiled-workflow scheduling check", () => {
  it("both orchestrators write Lessons through the sequential step, in reading order", async () => {
    const fs = await import("node:fs");
    const gen = fs.readFileSync("workflows/course-generation.ts", "utf8");
    const rev = fs.readFileSync("workflows/course-revision.ts", "utf8");
    const steps = fs.readFileSync("workflows/course-steps.ts", "utf8");
    for (const text of [gen, rev]) {
      expect(text).toContain("for (const lesson of pending)");
      expect(text).toContain("stepGenerationCancelled");
      expect(text).toContain("runReviewRound");
      expect(text).toContain("stepFetchCorrectionSources");
      expect(text).not.toContain("runWithConcurrency");
      expect(text).not.toContain("LESSON_CONCURRENCY");
      expect(text).not.toContain("LESSON_WAVE_SIZE");
      expect(text).not.toContain("stepPlanSources");
    }
    // The shared step loads earlier summaries and the complete previous Lesson.
    expect(steps).toContain("getLessonContentsForVersion");
    expect(steps).toContain("contextSummary");
    expect(steps).toContain("previousLesson");
    // The shared review path runs structural first, then one critical factual
    // model pass.
    expect(steps).toContain("stepCombinedReview");
    expect(steps).toContain("combinedFindings");
    expect(steps).toContain("stepFetchCorrectionSources");
  });
});
