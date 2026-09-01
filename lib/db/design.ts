/**
 * Repositories for design state: the versioned Outline, the private
 * specification, gathered Sources, and design runs. Every function takes
 * the Drizzle instance first, so tests run these against PGlite. The
 * caller authorizes: pages reach these through an owned Course lookup,
 * and the Workflow passes the server-side Course id.
 */
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
} from "../course/types";

/**
 * Server-side Course lookup for the Workflow, which runs without a
 * Learner request context. Entry points that do take a Learner must go
 * through `findOwnedCourse`, which filters by owner.
 */
export async function findCourseForDesign(
  db: Db,
  courseId: string,
): Promise<Course | undefined> {
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return course;
}

/** Opens a design run: the course shows "designing" while this is running. */
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

/** Marks which step a run is in, for the progress interface. */
export async function recordDesignStep(
  db: Db,
  runId: string,
  currentStep: string,
): Promise<void> {
  await db
    .update(designRuns)
    .set({ currentStep, updatedAt: new Date() })
    .where(eq(designRuns.id, runId));
}

/**
 * Persists everything a successful design produced, in one transaction:
 * Sources replace any earlier run's, the Outline is appended as a new
 * version (stable ids belong to one version), and the Course reaches the
 * Outline checkpoint.
 */
export async function saveDesignResult(
  db: Db,
  courseId: string,
  runId: string,
  outcome: DesignOutcome,
): Promise<Outline> {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ version: outlines.version })
      .from(outlines)
      .where(eq(outlines.courseId, courseId))
      .orderBy(desc(outlines.version))
      .limit(1);

    await tx.delete(sources).where(eq(sources.courseId, courseId));
    if (outcome.sources.length > 0) {
      await tx.insert(sources).values(
        outcome.sources.map((s) => ({
          courseId,
          ref: s.ref,
          title: s.title,
          url: s.url,
          fetchedAt: new Date(s.fetchedAt),
          excerpt: s.excerpt,
        })),
      );
    }

    const [outline] = await tx
      .insert(outlines)
      .values({
        courseId,
        version: (previous?.version ?? 0) + 1,
        data: outcome.outline,
      })
      .returning();

    await tx
      .insert(courseSpecs)
      .values({
        courseId,
        spec: outcome.specification,
        outlineVersion: outline.version,
      })
      .onConflictDoUpdate({
        target: courseSpecs.courseId,
        set: { spec: outcome.specification, outlineVersion: outline.version },
      });

    await tx
      .update(courses)
      .set({ status: "awaiting-outline-approval", updatedAt: new Date() })
      .where(eq(courses.id, courseId));

    await tx
      .update(designRuns)
      .set({ status: "succeeded", currentStep: "persist", updatedAt: new Date() })
      .where(eq(designRuns.id, runId));

    return outline;
  });
}

/**
 * Records a failed design: the run keeps the message, the Course reads as
 * "failed", and both stay in place for retry (ticket #7).
 */
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

/** The most recent design run for a Course, if any. */
export async function latestDesignRun(
  db: Db,
  courseId: string,
): Promise<DesignRun | undefined> {
  const [run] = await db
    .select()
    .from(designRuns)
    .where(eq(designRuns.courseId, courseId))
    .orderBy(desc(designRuns.startedAt))
    .limit(1);
  return run;
}

/** The current Outline: the highest version for the Course. */
export async function latestOutline(
  db: Db,
  courseId: string,
): Promise<Outline | undefined> {
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
): Promise<CourseSpecification | undefined> {
  const [row] = await db
    .select()
    .from(courseSpecs)
    .where(eq(courseSpecs.courseId, courseId))
    .limit(1);
  return row?.spec;
}

export async function listCourseSources(
  db: Db,
  courseId: string,
): Promise<SourceRow[]> {
  return db
    .select()
    .from(sources)
    .where(eq(sources.courseId, courseId))
    .orderBy(sources.ref);
}

/** Moves an owned Course to a new status; the only status door there is. */
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
