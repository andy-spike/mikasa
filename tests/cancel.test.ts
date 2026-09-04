import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { deleteOwnedDesigningCourse } from "@/lib/db/courses";
import { generationRunCancelled } from "@/lib/db/outline";
import { designCourseExists } from "@/lib/db/design";
import { cancelGenerationRun } from "@/lib/db/review";
import {
  courses,
  designRuns,
  generationRuns,
  lessons,
  outlines,
  courseSpecs,
  reviewFindings,
  reviewRuns,
  users,
} from "@/lib/db/schema";
import { makeTestDb } from "./helpers/test-db";

type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

async function seedUser(db: TestDb, id: string) {
  const [user] = await db
    .insert(users)
    .values({
      id,
      name: "L",
      email: `${id}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return user;
}

async function seedDesigningCourse(db: TestDb, ownerId: string) {
  const [course] = await db
    .insert(courses)
    .values({
      ownerId,
      topic: "the Vercel AI SDK",
      goal: "build my own AI chat app",
      depth: "reach",
      status: "designing",
    })
    .returning();
  const [run] = await db.insert(designRuns).values({ courseId: course.id }).returning();
  return { course, run };
}

const OUTLINE = {
  modules: [
    {
      id: "m1",
      ordinal: 1,
      numeral: "I",
      title: "Module one",
      lessons: [{ id: "l1", ordinal: 1, title: "Lesson one", summary: "First.", minutes: 20 }],
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
  alignment: [
    {
      lessonId: "l1",
      performance: "does",
      prerequisiteNodes: [],
      moduleMilestone: "m",
      exerciseContribution: "c",
    },
  ],
  finalExercise: { task: "t", acceptanceChecks: ["c"] },
  evidence: [],
};

async function seedGeneratingCourse(db: TestDb, ownerId: string) {
  const [course] = await db
    .insert(courses)
    .values({
      ownerId,
      topic: "the Vercel AI SDK",
      goal: "build my own AI chat app",
      depth: "reach",
      status: "generating",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: OUTLINE });
  await db.insert(courseSpecs).values({ courseId: course.id, spec: SPEC, outlineVersion: 1 });
  const [run] = await db
    .insert(generationRuns)
    .values({ courseId: course.id, outlineVersion: 1 })
    .returning();
  await db.insert(lessons).values({
    courseId: course.id,
    outlineVersion: 1,
    lessonRef: "l1",
    title: "Lesson one",
    body: [{ kind: "p", text: "x" }],
    workedExample: [{ kind: "p", text: "y" }],
    recallPrompt: "r",
    selfExplanationPrompt: "s",
    exercise: { task: "t", check: "c" },
    bridge: "b",
  });
  const [review] = await db
    .insert(reviewRuns)
    .values({ courseId: course.id, outlineVersion: 1 })
    .returning();
  await db.insert(reviewFindings).values({
    reviewRunId: review.id,
    courseId: course.id,
    outlineVersion: 1,
    round: 0,
    kind: "structure",
    detail: "d",
    correction: "c",
  });
  return { course, run, review };
}

describe("cancelling a designing Course", () => {
  it("deletes the owned Course and its run rows", async () => {
    const db = await makeTestDb();
    const user = await seedUser(db, "u1");
    const { course } = await seedDesigningCourse(db, user.id);

    const result = await deleteOwnedDesigningCourse(db, user.id, course.id);
    expect(result).toEqual({ ok: true });

    expect(await db.select().from(courses).where(eq(courses.id, course.id))).toEqual([]);
    expect(await db.select().from(designRuns).where(eq(designRuns.courseId, course.id))).toEqual(
      [],
    );
    expect(await designCourseExists(db, course.id)).toBe(false);
  });

  it("refuses when the design already finished", async () => {
    const db = await makeTestDb();
    const user = await seedUser(db, "u1");
    const { course } = await seedDesigningCourse(db, user.id);
    await db
      .update(courses)
      .set({ status: "awaiting-outline-approval" })
      .where(eq(courses.id, course.id));

    const result = await deleteOwnedDesigningCourse(db, user.id, course.id);
    expect(result).toEqual({ ok: false, reason: "too-late" });
    expect((await db.select().from(courses).where(eq(courses.id, course.id))).length).toBe(1);
  });

  it("refuses a Course owned by someone else", async () => {
    const db = await makeTestDb();
    const owner = await seedUser(db, "u1");
    await seedUser(db, "u2");
    const { course } = await seedDesigningCourse(db, owner.id);

    const result = await deleteOwnedDesigningCourse(db, "u2", course.id);
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect((await db.select().from(courses).where(eq(courses.id, course.id))).length).toBe(1);
  });
});

describe("cancelling a generating Course", () => {
  it("returns the Course to its Outline checkpoint and clears the partial run", async () => {
    const db = await makeTestDb();
    const user = await seedUser(db, "u1");
    const { course, run } = await seedGeneratingCourse(db, user.id);

    const result = await cancelGenerationRun(db, user.id, course.id);
    expect(result).toEqual({ ok: true, outlineVersion: 1 });

    const [after] = await db.select().from(courses).where(eq(courses.id, course.id));
    expect(after.status).toBe("awaiting-outline-approval");

    expect(await db.select().from(generationRuns).where(eq(generationRuns.id, run.id))).toEqual([]);
    expect(
      await db
        .select()
        .from(lessons)
        .where(and(eq(lessons.courseId, course.id), eq(lessons.outlineVersion, 1))),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(reviewRuns)
        .where(and(eq(reviewRuns.courseId, course.id), eq(reviewRuns.outlineVersion, 1))),
    ).toEqual([]);
    expect(
      await db.select().from(reviewFindings).where(eq(reviewFindings.courseId, course.id)),
    ).toEqual([]);

    // The approved Outline and specification stay for a later approval.
    expect((await db.select().from(outlines).where(eq(outlines.courseId, course.id))).length).toBe(
      1,
    );
    expect(
      (await db.select().from(courseSpecs).where(eq(courseSpecs.courseId, course.id))).length,
    ).toBe(1);
    expect(await generationRunCancelled(db, run.id)).toBe(true);
  });

  it("restores the checkpoint again when no run row is left", async () => {
    const db = await makeTestDb();
    const user = await seedUser(db, "u1");
    const { course, run } = await seedGeneratingCourse(db, user.id);
    await db.delete(generationRuns).where(eq(generationRuns.id, run.id));

    const result = await cancelGenerationRun(db, user.id, course.id);
    expect(result).toEqual({ ok: true, outlineVersion: 1 });
    const [after] = await db.select().from(courses).where(eq(courses.id, course.id));
    expect(after.status).toBe("awaiting-outline-approval");
  });

  it("refuses when the Course is not generating", async () => {
    const db = await makeTestDb();
    const user = await seedUser(db, "u1");
    const { course } = await seedGeneratingCourse(db, user.id);
    await db.update(courses).set({ status: "ready" }).where(eq(courses.id, course.id));

    const result = await cancelGenerationRun(db, user.id, course.id);
    expect(result).toEqual({ ok: false, reason: "too-late" });
  });

  it("refuses a Course owned by someone else", async () => {
    const db = await makeTestDb();
    const owner = await seedUser(db, "u1");
    await seedUser(db, "u2");
    const { course } = await seedGeneratingCourse(db, owner.id);

    const result = await cancelGenerationRun(db, "u2", course.id);
    expect(result).toEqual({ ok: false, reason: "not-found" });
    const [kept] = await db.select().from(courses).where(eq(courses.id, course.id));
    expect(kept.status).toBe("generating");
  });
});

describe("workflow cancellation guards", () => {
  it("treats a missing run row as cancelled and any present row as live", async () => {
    const db = await makeTestDb();
    const user = await seedUser(db, "u1");
    const { run } = await seedGeneratingCourse(db, user.id);

    expect(await generationRunCancelled(db, run.id)).toBe(false);
    await db.delete(generationRuns).where(eq(generationRuns.id, run.id));
    expect(await generationRunCancelled(db, run.id)).toBe(true);
    expect(await generationRunCancelled(db, "00000000-0000-0000-0000-000000000000")).toBe(true);
  });
});
