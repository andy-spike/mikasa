import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./index";
import {
  changeOperations,
  changePlans,
  completions,
  courses,
  outlines,
  revisions,
  type Course,
} from "./schema";
import type { CourseLibraryInput } from "@/lib/course/library";

export function listOwnedCourses(db: Db, ownerId: string): Promise<Course[]> {
  return db
    .select()
    .from(courses)
    .where(eq(courses.ownerId, ownerId))
    .orderBy(desc(courses.createdAt));
}

/**
 * The Courses page's own read: every owned Course with the published
 * Outline it is reading from, its completions, and any plan in flight, in
 * batched queries rather than one round trip per Course.
 */
export async function listOwnedCoursesForIndex(
  db: Db,
  ownerId: string,
): Promise<CourseLibraryInput[]> {
  const owned = await listOwnedCourses(db, ownerId);
  if (owned.length === 0) return [];
  const ids = owned.map((course) => course.id);

  const [revisionRows, outlineRows, completionRows, planRows] = await Promise.all([
    db.select().from(revisions).where(inArray(revisions.courseId, ids)),
    db.select().from(outlines).where(inArray(outlines.courseId, ids)),
    db
      .select({
        courseId: completions.courseId,
        lessonRef: completions.lessonRef,
        doneAt: completions.doneAt,
      })
      .from(completions)
      .where(inArray(completions.courseId, ids)),
    db
      .select({
        id: changePlans.id,
        courseId: changePlans.courseId,
        status: changePlans.status,
        createdAt: changePlans.createdAt,
      })
      .from(changePlans)
      .where(
        and(
          inArray(changePlans.courseId, ids),
          inArray(changePlans.status, ["proposed", "staged"]),
        ),
      ),
  ]);

  // The revision with the highest number is the Course as it is published.
  const published = new Map<string, { revisionNumber: number; outlineVersion: number }>();
  for (const revision of revisionRows) {
    const seen = published.get(revision.courseId);
    if (!seen || revision.revisionNumber > seen.revisionNumber) {
      published.set(revision.courseId, {
        revisionNumber: revision.revisionNumber,
        outlineVersion: revision.outlineVersion,
      });
    }
  }
  const outlineByVersion = new Map(
    outlineRows.map((outline) => [`${outline.courseId}:${outline.version}`, outline]),
  );

  // A proposed plan outranks a staged one: it is the plan that wants the
  // learner. Within one status, the newest plan wins.
  const byCourse = new Map<string, { proposed?: string; staged?: string }>();
  for (const plan of [...planRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const entry = byCourse.get(plan.courseId) ?? {};
    if (plan.status === "proposed" && !entry.proposed) entry.proposed = plan.id;
    if (plan.status === "staged" && !entry.staged) entry.staged = plan.id;
    byCourse.set(plan.courseId, entry);
  }

  const proposedPlanIds = [...byCourse.values()].flatMap((entry) =>
    entry.proposed ? [entry.proposed] : [],
  );
  const changeCounts = new Map<string, number>();
  if (proposedPlanIds.length > 0) {
    const operations = await db
      .select({ planId: changeOperations.planId })
      .from(changeOperations)
      .where(
        and(
          inArray(changeOperations.planId, proposedPlanIds),
          eq(changeOperations.status, "proposed"),
        ),
      );
    for (const operation of operations) {
      changeCounts.set(operation.planId, (changeCounts.get(operation.planId) ?? 0) + 1);
    }
  }

  return owned.map((course) => {
    const revision = published.get(course.id);
    const outline = revision
      ? (outlineByVersion.get(`${course.id}:${revision.outlineVersion}`)?.data ?? null)
      : null;
    const plans = byCourse.get(course.id);
    const proposed = plans?.proposed;
    return {
      id: course.id,
      topic: course.topic,
      goal: course.goal,
      status: course.status,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      completedAt: course.completedAt,
      outline,
      completions: completionRows.filter((row) => row.courseId === course.id),
      plan: proposed ? "proposed" : plans?.staged ? "staged" : null,
      proposedChanges: proposed ? (changeCounts.get(proposed) ?? 0) : 0,
    };
  });
}

export function findOwnedCourse(db: Db, ownerId: string, id: string): Promise<Course | undefined> {
  return db
    .select()
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, id)))
    .limit(1)
    .then((rows) => rows[0]);
}

export type CancelDesignResult = { ok: true } | { ok: false; reason: "not-found" | "too-late" };

/**
 * Discards a Course that is still designing. Runs, Sources, Outline
 * previews and design events go with it through foreign-key cascades;
 * the in-flight workflow stops at its next step boundary. Refuses when
 * the design already finished, so a late click cannot delete an Outline
 * that is ready for review.
 */
export async function deleteOwnedDesigningCourse(
  db: Db,
  ownerId: string,
  id: string,
): Promise<CancelDesignResult> {
  const [course] = await db
    .select({ status: courses.status })
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, id)))
    .limit(1);
  if (!course) return { ok: false, reason: "not-found" };
  if (course.status !== "designing") return { ok: false, reason: "too-late" };
  // One conditional delete: a design that finishes between the check and
  // here matches zero rows instead of deleting a finished Outline.
  const deleted = await db
    .delete(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, id), eq(courses.status, "designing")))
    .returning({ id: courses.id });
  if (deleted.length === 0) return { ok: false, reason: "too-late" };
  return { ok: true };
}

/**
 * Deletes a Course in any state. Runs, Sources, Outline, Lessons and
 * review work go with it through foreign-key cascades; an in-flight
 * workflow stops at its next step boundary when its data is gone.
 */
export async function deleteOwnedCourse(db: Db, ownerId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, id)))
    .returning({ id: courses.id });
  return deleted.length > 0;
}
