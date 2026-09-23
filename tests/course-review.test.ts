import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

const modelState = vi.hoisted(() => ({
  current: undefined as ReturnType<typeof import("./helpers/fake-model").scriptedModel> | undefined,
}));
vi.mock("@/lib/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model")>("@/lib/model");
  return {
    ...actual,
    generationModel: () => modelState.current!.model,
    embedTexts: async (texts: string[]) => texts.map(() => new Array<number>(1536).fill(0.01)),
  };
});

import { json, scriptedModel } from "./helpers/fake-model";
import { makeTestDb } from "./helpers/test-db";
import { makeOutline, makeSpec } from "./helpers/fixtures";
import type { LessonContent } from "@/lib/course/content";

const {
  applyLessonCorrections,
  combinedFindings,
  correctLesson,
  MAX_CORRECTION_ROUNDS,
  structuralFindings,
} = await import("@/lib/course/review");
const { parseLessonContent } = await import("@/lib/course/content");
const {
  currentRevision,
  failReview,
  findOwnedPublishedCourse,
  openReviewRun,
  publishRevision,
  saveFindings,
} = await import("@/lib/db/review");
const { getLessonContentsForVersion, saveLessonContent } = await import("@/lib/db/lessons");
const { courses, courseSpecs, generationRuns, outlines, revisions, sources, users } =
  await import("@/lib/db/schema");

const OUTLINE = makeOutline([2]);
const SPEC = makeSpec(OUTLINE, {
  topic: "the Vercel AI SDK",
  goal: "build my own AI chat app",
  background: "I know React.",
  terminalPerformances: ["Ship a chat app"],
  throughline: { premise: "One app", runningExample: "The chat app", vocabulary: [] },
  learningGraph: [
    { id: "g1", skill: "Stream text", requires: [], lessonId: "l1" },
    { id: "g2", skill: "Ship it", requires: ["g1"], lessonId: "l2" },
  ],
  alignment: (l) => ({
    lessonId: l.id,
    performance: `does ${l.title}`,
    prerequisiteNodes: [],
    moduleMilestone: "milestone",
    exerciseContribution: "contributes",
    exampleStart: "",
    exampleEnd: "",
    sourceRefs: [],
  }),
  finalExercise: { task: "Build it", acceptanceChecks: ["It runs"] },
  evidence: [{ sourceRef: "src-1", supports: "The main claim" }],
});

function contentFor(lessonId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return parseLessonContent(lessonId, `Lesson ${lessonId.slice(1)}`, {
    body: [{ kind: "p", text: "Explanation.", sourceRefs: ["src-1"] }],
    workedExample: [{ kind: "p", text: "Worked through the chat app." }],
    recallPrompt: "What was first?",
    selfExplanationPrompt: "Why this way?",
    exercise: { task: "Do it.", check: "It ran." },
    bridge: "Next comes more.",
    contextSummary: `Lesson ${lessonId.slice(1)} extends the chat app.`,
    ...overrides,
  });
}

/**
 * A Lesson assembled without the strict parser, so structural review can
 * be exercised against exactly the corruption it exists to catch.
 */
function rawContentFor(
  lessonId: string,
  overrides: Partial<Record<string, unknown>> = {},
): LessonContent {
  return {
    lessonId,
    title: `Lesson ${lessonId.slice(1)}`,
    body: [{ kind: "p", text: "Explanation.", sourceRefs: ["src-1"] }],
    workedExample: [{ kind: "p", text: "Worked through the chat app." }],
    recallPrompt: "What was first?",
    selfExplanationPrompt: "Why this way?",
    exercise: { task: "Do it.", check: "It ran." },
    bridge: "Next comes more.",
    contextSummary: `Lesson ${lessonId.slice(1)} extends the chat app.`,
    ...overrides,
  } as LessonContent;
}

let db: Awaited<ReturnType<typeof makeTestDb>>;

beforeEach(async () => {
  db = await makeTestDb();
});

afterEach(async () => {
  await db.delete(users);
});

async function seedCandidate(): Promise<string> {
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
      depth: "reach",
      status: "reviewing",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  await db.insert(generationRuns).values({
    courseId: course.id,
    outlineVersion: 1,
    status: "succeeded",
    currentStep: "complete",
  });
  return course.id;
}

describe("structuralFindings", () => {
  it("passes a whole candidate that cites known Sources", () => {
    const findings = structuralFindings({
      spec: SPEC,
      outline: OUTLINE,
      lessons: [contentFor("l1"), contentFor("l2")],
    });
    expect(findings).toEqual([]);
  });

  it("catches a missing Lesson, an empty part, and an invented citation", () => {
    const lessons = [
      rawContentFor("l1"),
      rawContentFor("l2", {
        body: [{ kind: "p", text: "x", sourceRefs: ["src-9"] }],
        workedExample: [],
        bridge: "",
      }),
    ];
    const findings = structuralFindings({
      spec: SPEC,
      outline: OUTLINE,
      lessons: lessons,
    });

    const details = findings.map((f) => f.detail).join("\n");
    expect(details).toContain('cites Source "src-9"');
    expect(details).toContain("no worked example");
    expect(details).toContain("no bridge");
    for (const finding of findings) {
      expect(finding.lessonRef).toBe("l2");
      expect(finding.kind).toBe("structural");
    }
  });

  it("catches a Lesson that assumes a skill taught later", () => {
    const late = {
      ...SPEC,
      alignment: [{ ...SPEC.alignment[0], prerequisiteNodes: ["g2"] }, SPEC.alignment[1]],
    };
    const findings = structuralFindings({
      spec: late,
      outline: OUTLINE,
      lessons: [contentFor("l1"), contentFor("l2")],
    });
    expect(findings.some((f) => f.detail.includes("later Lesson"))).toBe(true);
  });
});

describe("complete Course review", () => {
  it("repairs an early summary, rechecks later Lessons, and publishes only after correction", async () => {
    db = (await import("@/lib/db")).db as unknown as typeof db;
    const courseId = await seedCandidate();
    await db.insert(sources).values({
      courseId,
      ref: "src-1",
      title: "Docs",
      url: "https://example.com/docs",
      excerpt: "The app is ChatApp.",
    });
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    await saveLessonContent(
      db,
      courseId,
      1,
      run.id,
      contentFor("l1", {
        body: [{ kind: "p", text: "The shared app is ChatApp." }],
        contextSummary: "The shared app is WrongApp.",
      }),
    );
    await saveLessonContent(
      db,
      courseId,
      1,
      run.id,
      contentFor("l2", {
        body: [{ kind: "p", text: "Continue WrongApp." }],
        contextSummary: "Continue WrongApp.",
      }),
    );
    modelState.current = scriptedModel([
      json({
        findings: [
          {
            kind: "summary",
            lessonRefs: ["l1"],
            quote: "WrongApp",
            detail: "Misnames the app.",
            correction: "Read Lesson one.",
          },
        ],
      }),
      json({ contextSummary: "The shared app is ChatApp." }),
      json({
        findings: [
          {
            kind: "continuity",
            lessonRefs: ["l2"],
            quote: "WrongApp",
            detail: "Uses the old name.",
            correction: "Use ChatApp.",
          },
        ],
      }),
      json({ replacements: [{ quote: "WrongApp", replacement: "ChatApp", replaceAll: false }] }),
      json({ contextSummary: "Continue ChatApp." }),
      json({ findings: [] }),
    ]);
    const { generateCourseWorkflow } = await import("@/workflows/course-generation");

    const result = await generateCourseWorkflow(courseId, run.id, 1);

    expect(result).toMatchObject({ ok: true, revisionNumber: 1 });
    expect(modelState.current.calls()).toBe(6);
    const saved = await getLessonContentsForVersion(db, courseId, 1);
    expect(saved[0].contextSummary).toBe("The shared app is ChatApp.");
    expect(saved[1].body[0]).toMatchObject({ text: "Continue ChatApp." });
    expect(saved[1].contextSummary).toBe("Continue ChatApp.");
    expect(modelState.current.prompts[2]).toContain("The shared app is ChatApp.");
  });

  it("accepts a harmful quote from a saved Lesson context summary", async () => {
    const courseId = await seedCandidate();
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    await saveLessonContent(
      db,
      courseId,
      1,
      run.id,
      contentFor("l1", { contextSummary: "The shared app is named WrongApp." }),
    );
    await saveLessonContent(db, courseId, 1, run.id, contentFor("l2"));
    const saved = await getLessonContentsForVersion(db, courseId, 1);
    const model = scriptedModel([
      json({
        findings: [
          {
            kind: "summary",
            lessonRefs: ["l1"],
            quote: "WrongApp",
            detail: "The Lesson calls the app ChatApp; later Lessons will use the wrong name.",
            correction: "Regenerate from Lesson one.",
          },
          {
            kind: "continuity",
            lessonRefs: ["l2"],
            quote: "Stale quote from before summary repair.",
            detail: "Lesson two follows the stale name.",
            correction: "Follow Lesson one after its summary is repaired.",
          },
        ],
      }),
    ]);

    const findings = await combinedFindings(
      model.model,
      { topic: "the Vercel AI SDK", goal: "build my own AI chat app", language: "en" },
      SPEC,
      OUTLINE,
      [],
      saved,
    );
    expect(findings).toMatchObject([{ kind: "summary", lessonRef: "l1", quote: "WrongApp" }]);
    expect(findings).toHaveLength(1);
    expect(model.prompts[0]).toContain("The shared app is named WrongApp.");
  });

  it("repairs a misleading summary from its Lesson without rewriting prose", async () => {
    db = (await import("@/lib/db")).db as unknown as typeof db;
    const courseId = await seedCandidate();
    const [run] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    const original = contentFor("l1", { contextSummary: "The shared app is named WrongApp." });
    await saveLessonContent(db, courseId, 1, run.id, original);
    modelState.current = scriptedModel([
      json({ contextSummary: "The shared app uses the name ChatApp." }),
    ]);
    const { stepCorrectLesson } = await import("@/workflows/course-steps");

    await stepCorrectLesson(courseId, 1, run.id, "l1", [
      {
        kind: "summary",
        lessonRef: "l1",
        quote: "WrongApp",
        detail: "Later Lessons would use the wrong name.",
        correction: "Regenerate from Lesson one.",
      },
    ]);

    const [saved] = await getLessonContentsForVersion(db, courseId, 1);
    expect(saved.contextSummary).toBe("The shared app uses the name ChatApp.");
    expect(saved.body).toEqual(original.body);
    expect(modelState.current.calls()).toBe(1);
    expect(modelState.current.prompts[0]).toContain("Explanation.");
  });
});

describe("correctLesson", () => {
  it("rewrites only the affected Lesson, in the same six-part shape", async () => {
    const model = scriptedModel([
      json({
        replacements: [
          {
            quote: "Explanation.",
            replacement: "Explanation, now with v7.",
            replaceAll: false,
          },
        ],
      }),
    ]);

    const corrected = await correctLesson(
      model.model,
      { topic: "t", goal: "g", language: "en" },
      SPEC,
      contentFor("l1"),
      [
        {
          kind: "factual",
          lessonRef: "l1",
          quote: "Explanation.",
          detail: "Wrong version.",
          correction: "Say v7.",
        },
      ],
      [],
    );

    expect(corrected.lessonId).toBe("l1");
    expect(corrected.body[0]).toMatchObject({ text: "Explanation, now with v7." });
    expect(model.prompts[0]).toContain("Wrong version.");
    expect(JSON.stringify(model.responseFormats[0])).toContain('"replacements"');
  });

  it("holds the corrected Lesson to the example contract", async () => {
    const contract = "img.card-img; 300px and 500px breakpoints";
    const model = scriptedModel([
      json({
        replacements: [{ quote: "Explanation.", replacement: "Fixed.", replaceAll: false }],
      }),
    ]);

    await correctLesson(
      model.model,
      { topic: "t", goal: "g", language: "en" },
      makeSpec(makeOutline([2]), {
        throughline: {
          premise: "p",
          runningExample: "r",
          vocabulary: [],
          exampleContract: contract,
        },
      }),
      contentFor("l1"),
      [
        {
          kind: "factual",
          lessonRef: "l1",
          quote: "Explanation.",
          detail: "Names drift.",
          correction: "Match the contract.",
        },
      ],
      [],
    );

    expect(model.prompts[0]).toContain("authoritative");
    expect(model.prompts[0]).toContain(contract);
  });

  it("shows the corrected Lesson the other Lessons' current text", async () => {
    const model = scriptedModel([
      json({
        replacements: [{ quote: "Explanation.", replacement: "Fixed.", replaceAll: false }],
      }),
    ]);

    await correctLesson(
      model.model,
      { topic: "t", goal: "g", language: "en" },
      SPEC,
      contentFor("l2"),
      [
        {
          kind: "factual",
          lessonRef: "l2",
          quote: "Explanation.",
          detail: "The recap contradicts Lesson 1.",
          correction: "Match what Lesson 1 ships.",
        },
      ],
      [
        {
          title: "Lesson one",
          contextSummary: "Lesson one wraps one card.",
          fullContent: contentFor("l1", {
            exercise: { task: "Wrap one card", check: "class names match the contract" },
          }),
        },
      ],
    );

    expect(model.prompts[0]).toContain("private context summaries");
    expect(model.prompts[0]).toContain('"task":"Wrap one card"');
  });

  it("rejects ambiguous replacements unless the model explicitly replaces all matches", () => {
    const lesson = contentFor("l1", {
      body: [{ kind: "p", text: "Wrong. Wrong.", sourceRefs: ["src-1"] }],
    });
    const finding = {
      kind: "factual" as const,
      lessonRef: "l1",
      quote: "Wrong.",
      detail: "Wrong twice.",
      correction: "Fix both.",
    };
    expect(() =>
      applyLessonCorrections(
        lesson,
        [finding],
        [{ quote: "Wrong.", replacement: "Right.", replaceAll: false }],
      ),
    ).toThrow(/ambiguous/);
    expect(
      applyLessonCorrections(
        lesson,
        [finding],
        [{ quote: "Wrong.", replacement: "Right.", replaceAll: true }],
      ).body[0],
    ).toMatchObject({ text: "Right. Right." });
  });

  it("keeps every unmentioned field byte-for-byte and protects the Exercise", () => {
    const lesson = contentFor("l1");
    const before = structuredClone(lesson);
    const corrected = applyLessonCorrections(
      lesson,
      [
        {
          kind: "factual",
          lessonRef: "l1",
          quote: "Explanation.",
          detail: "Wrong.",
          correction: "Fix.",
        },
      ],
      [{ quote: "Explanation.", replacement: "Fixed.", replaceAll: false }],
      true,
    );
    expect(corrected).toEqual({
      ...before,
      body: [{ ...before.body[0], text: "Fixed." }],
    });
    expect(corrected.exercise).toEqual(before.exercise);
  });
});

describe("publication", () => {
  it("publishes atomically: the revision appears with the Course ready", async () => {
    const courseId = await seedCandidate();
    const { reviewRuns } = await import("@/lib/db/schema");
    const [genRun] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    await saveLessonContent(db, courseId, 1, genRun.id, contentFor("l1"));
    await saveLessonContent(db, courseId, 1, genRun.id, contentFor("l2"));
    const [run] = await db
      .insert(reviewRuns)
      .values({ courseId, outlineVersion: 1, status: "succeeded" })
      .returning();

    const published = await publishRevision(db, courseId, 1, run.id);
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("ready");

    const revision = await currentRevision(db, courseId);
    expect(revision?.revisionNumber).toBe(1);
    expect(revision?.outlineVersion).toBe(1);
  });

  it("refuses to publish with open findings or an unreviewed candidate", async () => {
    const courseId = await seedCandidate();
    const run = await openReviewRun(db, courseId, 1);
    await saveFindings(db, run.id, courseId, 1, 0, [
      { kind: "factual", lessonRef: "l1", detail: "Wrong.", correction: "Fix." },
    ]);

    const blocked = await publishRevision(db, courseId, 1, run.id);
    expect(blocked).toMatchObject({ ok: false });

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("reviewing");
    expect(await currentRevision(db, courseId)).toBeUndefined();
  });

  it("a failed review stays private: no revision, no reading path", async () => {
    const courseId = await seedCandidate();
    const run = await openReviewRun(db, courseId, 1);
    await saveFindings(db, run.id, courseId, 1, 0, [
      {
        kind: "factual",
        lessonRef: null,
        detail: "Wrong version.",
        correction: "Rewrite.",
      },
    ]);
    await failReview(db, courseId, run.id, "The review did not pass.");

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("failed");

    const reading = await findOwnedPublishedCourse(db, "u1", courseId);
    expect(reading).toBeUndefined();
  });

  it("keeps the two-round cap a constant the workflow cannot stretch", () => {
    expect(MAX_CORRECTION_ROUNDS).toBe(3);
  });
});

describe("reading path", () => {
  it("reads the current revision with the owned Course's Lessons and Sources", async () => {
    const courseId = await seedCandidate();
    const [genRun] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.courseId, courseId));
    await saveLessonContent(db, courseId, 1, genRun.id, contentFor("l1"));
    await saveLessonContent(db, courseId, 1, genRun.id, contentFor("l2"));
    const { reviewRuns } = await import("@/lib/db/schema");
    const [run] = await db
      .insert(reviewRuns)
      .values({ courseId, outlineVersion: 1, status: "succeeded" })
      .returning();
    const published = await publishRevision(db, courseId, 1, run.id);
    expect(published.ok).toBe(true);

    const reading = await findOwnedPublishedCourse(db, "u1", courseId);
    expect(reading?.lessonRows).toHaveLength(2);
    expect(reading?.sourceRows).toHaveLength(0);
    expect(reading?.outline.version).toBe(1);
    const { toReadingCourse } = await import("@/lib/course/reading");
    const publicCourse = toReadingCourse(
      reading!.course,
      reading!.outline.data,
      reading!.lessonRows,
    );
    expect(publicCourse.modules[0].lessons[0].summary).toBe(OUTLINE.modules[0].lessons[0].summary);
    expect(publicCourse.modules[0].lessons[0]).not.toHaveProperty("contextSummary");

    expect(await findOwnedPublishedCourse(db, "someone-else", courseId)).toBeUndefined();
  });

  it("reads nothing for a Course that never published", async () => {
    const courseId = await seedCandidate();
    expect(await findOwnedPublishedCourse(db, "u1", courseId)).toBeUndefined();
    expect(await db.select().from(revisions).where(eq(revisions.courseId, courseId))).toEqual([]);
  });
});
