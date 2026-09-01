/**
 * Review, correction, and publication (ticket #6), with the model
 * scripted: the three review slices, targeted corrections, the two-round
 * cap, the atomic publish, and the privacy of a failed review.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  return { db: await makeTestDb() };
});

import { json, scriptedModel } from "./helpers/fake-model";
import { makeTestDb } from "./helpers/test-db";
import type { LessonContent } from "@/lib/course/content";

const {
  correctLesson,
  designFindings,
  factualFindings,
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
const { saveLessonContent } = await import("@/lib/db/lessons");
const {
  courses,
  courseSpecs,
  generationRuns,
  outlines,
  revisions,
  users,
} = await import("@/lib/db/schema");

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
    background: "I know React.",
    depth: "reach",
    language: "en",
    terminalPerformances: ["Ship a chat app"],
    exclusions: [],
    learnerAssumptions: [],
  },
  throughline: { premise: "One app", runningExample: "The chat app", vocabulary: [] },
  learningGraph: [
    { id: "g1", skill: "Stream text", requires: [], lessonId: "l1" },
    { id: "g2", skill: "Ship it", requires: ["g1"], lessonId: "l2" },
  ],
  alignment: OUTLINE.modules[0].lessons.map((l) => ({
    lessonId: l.id,
    performance: `does ${l.title}`,
    prerequisiteNodes: [] as string[],
    moduleMilestone: "milestone",
    exerciseContribution: "contributes",
  })),
  finalExercise: { task: "Build it", acceptanceChecks: ["It runs"] },
  evidence: [{ sourceRef: "src-1", supports: "The main claim" }],
};

function contentFor(
  lessonId: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return parseLessonContent(lessonId, `Lesson ${lessonId.slice(1)}`, {
    body: [{ kind: "p", text: "Explanation.", sourceRefs: ["src-1"] }],
    workedExample: [{ kind: "p", text: "Worked through the chat app." }],
    recallPrompt: "What was first?",
    selfExplanationPrompt: "Why this way?",
    exercise: { task: "Do it.", check: "It ran." },
    bridge: "Next comes more.",
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
  await db
    .insert(generationRuns)
    .values({ courseId: course.id, outlineVersion: 1, status: "succeeded", currentStep: "complete" });
  return course.id;
}

const SOURCES = [
  { ref: "src-1", title: "The docs", url: "https://example.com/docs", excerpt: "e" },
];

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
    expect(details).toContain("cites Source \"src-9\"");
    expect(details).toContain("no worked example");
    expect(details).toContain("no bridge");
    /* Every finding names its Lesson. */
    for (const finding of findings) {
      expect(finding.lessonRef).toBe("l2");
      expect(finding.kind).toBe("structural");
    }
  });

  it("catches a Lesson that assumes a skill taught later", () => {
    const late = {
      ...SPEC,
      alignment: [
        { ...SPEC.alignment[0], prerequisiteNodes: ["g2"] },
        SPEC.alignment[1],
      ],
    };
    const findings = structuralFindings({
      spec: late,
      outline: OUTLINE,
      lessons: [contentFor("l1"), contentFor("l2")],
    });
    expect(findings.some((f) => f.detail.includes("later Lesson"))).toBe(true);
  });
});

describe("model reviews", () => {
  it("maps the model's findings onto the factual and design slices", async () => {
    const model = scriptedModel([
      json({ findings: [{ lessonRef: "l1", detail: "Wrong version number.", correction: "Fix to v7." }] }),
      json({ findings: [{ lessonRef: null, detail: "Bridge contradicts next Lesson.", correction: "Rewrite the bridge." }] }),
    ]);
    const courseMeta = { topic: "t", goal: "g", language: "en" };
    const lessons = [contentFor("l1"), contentFor("l2")];

    const factual = await factualFindings(model.model, courseMeta, SPEC, SOURCES, lessons);
    const design = await designFindings(model.model, courseMeta, SPEC, OUTLINE, lessons);

    expect(factual).toEqual([
      { kind: "factual", lessonRef: "l1", detail: "Wrong version number.", correction: "Fix to v7." },
    ]);
    expect(design[0].kind).toBe("learning-design");
    expect(design[0].lessonRef).toBeNull();
  });

  it("treats a broken model response as a review failure, not a pass", async () => {
    const model = scriptedModel(["not json"]);
    await expect(
      factualFindings(
        model.model,
        { topic: "t", goal: "g", language: "en" },
        SPEC,
        SOURCES,
        [contentFor("l1")],
      ),
    ).rejects.toThrow();
  });
});

describe("correctLesson", () => {
  it("rewrites only the affected Lesson, in the same six-part shape", async () => {
    const model = scriptedModel([
      json({
        body: [{ kind: "p", text: "Explanation, now with v7." }],
        workedExample: [{ kind: "p", text: "Worked through the chat app." }],
        recallPrompt: "What was first?",
        selfExplanationPrompt: "Why this way?",
        exercise: { task: "Do it.", check: "It ran." },
        bridge: "Next comes more.",
      }),
    ]);

    const corrected = await correctLesson(
      model.model,
      { topic: "t", goal: "g", language: "en" },
      SPEC,
      contentFor("l1"),
      [{ kind: "factual", lessonRef: "l1", detail: "Wrong version.", correction: "Say v7." }],
      [],
    );

    expect(corrected.lessonId).toBe("l1");
    expect(corrected.body[0]).toMatchObject({ text: "Explanation, now with v7." });
    expect(model.prompts[0]).toContain("Wrong version.");
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
      { kind: "learning-design", lessonRef: null, detail: "No throughline.", correction: "Rewrite." },
    ]);
    await failReview(db, courseId, run.id, "The review did not pass.");

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    expect(course.status).toBe("failed");

    /* Another Learner, and even the owner, read nothing. */
    const reading = await findOwnedPublishedCourse(db, "u1", courseId);
    expect(reading).toBeUndefined();
  });

  it("keeps the two-round cap a constant the workflow cannot stretch", () => {
    expect(MAX_CORRECTION_ROUNDS).toBe(2);
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

    /* Ownership is in the query. */
    expect(await findOwnedPublishedCourse(db, "someone-else", courseId)).toBeUndefined();
  });

  it("reads nothing for a Course that never published", async () => {
    const courseId = await seedCandidate();
    expect(await findOwnedPublishedCourse(db, "u1", courseId)).toBeUndefined();
    expect(await db.select().from(revisions).where(eq(revisions.courseId, courseId))).toEqual([]);
  });
});
