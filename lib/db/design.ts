import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./index";
import {
  courses,
  courseSpecs,
  designRuns,
  outlines,
  sources,
  type Course,
  type DesignRun,
  type Outline,
  type SourceRow,
} from "./schema";
import type {
  CourseSpecification,
  CourseStatus,
  DesignOutcome,
  GatheredSource,
  OutlineData,
} from "../course/types";
import type { OutlineDraft } from "../course/design";

/** Workflow-only: no owner check; learner paths must use `findOwnedCourse`. */
export async function findCourseForDesign(db: Db, courseId: string): Promise<Course | undefined> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  return course;
}

export async function startDesignRun(
  db: Db,
  courseId: string,
  workflowRunId?: string,
): Promise<DesignRun> {
  const [run] = await db
    .insert(designRuns)
    .values({ courseId, workflowRunId: workflowRunId ?? null })
    .returning();
  await db
    .update(courses)
    .set({ status: "designing", updatedAt: new Date() })
    .where(eq(courses.id, courseId));
  return run;
}

export async function recordDesignStep(db: Db, runId: string, currentStep: string): Promise<void> {
  await db
    .update(designRuns)
    .set({ currentStep, updatedAt: new Date() })
    .where(eq(designRuns.id, runId));
}

export async function saveDesignSources(
  db: Db,
  courseId: string,
  gathered: GatheredSource[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(sources).where(eq(sources.courseId, courseId));
    if (gathered.length > 0) {
      await tx.insert(sources).values(
        gathered.map((s) => ({
          courseId,
          ref: s.ref,
          title: s.title,
          url: s.url,
          fetchedAt: new Date(s.fetchedAt),
          excerpt: s.excerpt,
        })),
      );
    }
  });
}

export async function saveDesignOutline(
  db: Db,
  courseId: string,
  outline: OutlineData,
  draft?: OutlineDraft,
): Promise<Outline> {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ version: outlines.version })
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version))
      .limit(1);
    return tx
      .insert(outlines)
      .values({
        courseId,
        version: (previous?.version ?? 0) + 1,
        data: outline,
        draft: draft ?? null,
      })
      .returning()
      .then((rows) => rows[0]);
  });
}

export async function saveDesignSpecification(
  db: Db,
  courseId: string,
  specification: CourseSpecification,
  outlineVersion: number,
): Promise<void> {
  await db
    .insert(courseSpecs)
    .values({ courseId, spec: specification, outlineVersion })
    .onConflictDoUpdate({
      target: [courseSpecs.courseId, courseSpecs.outlineVersion],
      set: { spec: specification },
    });
}

export async function saveDesignResult(
  db: Db,
  courseId: string,
  runId: string,
  outcome: DesignOutcome,
  draft?: OutlineDraft,
): Promise<Outline> {
  await saveDesignSources(db, courseId, outcome.sources);
  const outline = await saveDesignOutline(db, courseId, outcome.outline, draft);
  await saveDesignSpecification(db, courseId, outcome.specification, outline.version);
  await completeDesignRun(db, courseId, runId);
  return outline;
}

export async function completeDesignRun(db: Db, courseId: string, runId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(courses)
      .set({ status: "awaiting-outline-approval", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
    await tx
      .update(designRuns)
      .set({ status: "succeeded", currentStep: "persist", updatedAt: new Date() })
      .where(eq(designRuns.id, runId));
  });
}

export async function failDesignRun(
  db: Db,
  courseId: string,
  runId: string,
  message: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(designRuns)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(designRuns.id, runId));
    await tx
      .update(courses)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });
}

export async function latestDesignRun(db: Db, courseId: string): Promise<DesignRun | undefined> {
  const [run] = await db
    .select()
    .from(designRuns)
    .where(eq(designRuns.courseId, courseId))
    .orderBy(desc(designRuns.startedAt))
    .limit(1);
  return run;
}

export async function latestOutline(db: Db, courseId: string): Promise<Outline | undefined> {
  const [outline] = await db
    .select()
    .from(outlines)
    .where(eq(outlines.courseId, courseId))
    .orderBy(desc(outlines.version))
    .limit(1);
  return outline;
}

export async function findCourseSpec(
  db: Db,
  courseId: string,
  outlineVersion?: number,
): Promise<CourseSpecification | undefined> {
  const [row] = await db
    .select()
    .from(courseSpecs)
    .where(
      outlineVersion === undefined
        ? eq(courseSpecs.courseId, courseId)
        : and(eq(courseSpecs.courseId, courseId), eq(courseSpecs.outlineVersion, outlineVersion)),
    )
    .orderBy(desc(courseSpecs.outlineVersion))
    .limit(1);
  return row?.spec;
}

export async function listCourseSources(db: Db, courseId: string): Promise<SourceRow[]> {
  return db.select().from(sources).where(eq(sources.courseId, courseId)).orderBy(sources.ref);
}

export async function setCourseStatus(
  db: Db,
  ownerId: string,
  courseId: string,
  status: CourseStatus,
): Promise<Course | undefined> {
  const [course] = await db
    .update(courses)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .returning();
  return course;
}
