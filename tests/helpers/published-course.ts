/**
 * Seeds a fully published Course (outline, spec, lesson content, successful
 * review, published revision) for one signed-in owner. Options cover the
 * variations the suites need: extra modules, custom lesson content, a
 * Source row, and post-publication embedding.
 */
import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  courseSpecs,
  courses,
  generationRuns,
  outlines,
  reviewRuns,
  sources,
  users,
} from "@/lib/db/schema";
import type { LessonContent } from "@/lib/course/content";
import { embedCourseFragments } from "@/lib/course/fragments";
import { saveLessonContent } from "@/lib/db/lessons";
import { publishRevision } from "@/lib/db/review";
import type { CourseSpecification, OutlineData, OutlineLesson } from "@/lib/course/types";
import { lessonContent } from "./fixtures";

export const OWNER = "owner@example.com";
export const OTHER = "other@example.com";

export async function userIdOf(email: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user.id;
}

export async function seedPublishedCourse(options: {
  ownerEmail: string;
  outline: OutlineData;
  spec: CourseSpecification;
  grounding?: boolean;
  /** Content for every module's lessons; default is the first module only. */
  allModules?: boolean;
  /** Return null to skip a Lesson. Default is the wash shape. */
  content?: (lesson: OutlineLesson, index: number) => LessonContent | null;
  source?: { ref: string; title: string; url: string; excerpt: string };
  embed?: (texts: string[]) => number[][];
}): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.email, options.ownerEmail)).limit(1);
  const [course] = await db
    .insert(courses)
    .values({
      ownerId: user.id,
      topic: options.spec.contract.topic,
      goal: options.spec.contract.goal,
      depth: "reach",
      ...(options.grounding === false ? { grounding: false } : {}),
      status: "reviewing",
    })
    .returning();
  await db.insert(outlines).values({ courseId: course.id, version: 1, data: options.outline });
  await db
    .insert(courseSpecs)
    .values({ courseId: course.id, spec: options.spec, outlineVersion: 1 });
  if (options.source) {
    await db.insert(sources).values({ courseId: course.id, ...options.source });
  }
  const [run] = await db
    .insert(generationRuns)
    .values({ courseId: course.id, outlineVersion: 1 })
    .returning();

  const modules = options.allModules
    ? options.outline.modules
    : options.outline.modules.slice(0, 1);
  let index = 0;
  for (const m of modules) {
    for (const l of m.lessons) {
      const content = options.content
        ? options.content(l, index)
        : lessonContent(l.id, l.title, `Lesson ${l.id} of the wash course.`);
      index += 1;
      if (!content) continue;
      await saveLessonContent(db, course.id, 1, run.id, content);
    }
  }

  const [review] = await db
    .insert(reviewRuns)
    .values({ courseId: course.id, outlineVersion: 1, status: "succeeded" })
    .returning();
  const published = await publishRevision(db, course.id, 1, review.id);
  expect(published.ok).toBe(true);

  if (options.embed) {
    await embedCourseFragments(db, async (texts) => options.embed!(texts), course.id, 1);
  }
  return course.id;
}

/** The standard wash Lesson content for one Lesson. */
export function washLesson(lesson: OutlineLesson, index: number): LessonContent {
  return lessonContent(lesson.id, lesson.title, `Lesson ${index + 1} of the wash course.`);
}

/** Proposes a change plan directly and accepts every operation of it. */
export async function proposeAndAccept(
  courseId: string,
  ops: import("@/lib/course/change-plan").ChangePlanOp[],
  ownerEmail: string,
  ownerCookie: string,
): Promise<string> {
  const { createChangePlan } = await import("@/lib/db/tailor");
  const { reviewTailorOperationAction } = await import("@/lib/actions/tailor");
  const { headerState } = await import("./request-context");

  const created = await createChangePlan(db, await userIdOf(ownerEmail), courseId, ops);
  expect(created.ok).toBe(true);
  const plan = (created as { ok: true; plan: { id: string; operations: { id: string }[] } }).plan;
  headerState.current = new Headers({ cookie: ownerCookie });
  for (const operation of plan.operations) {
    await reviewTailorOperationAction(plan.id, operation.id, "accepted");
  }
  return plan.id;
}
