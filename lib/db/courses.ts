import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./index";
import { courses, type Course } from "./schema";
import { currentCourseCompletion, type CourseCompletion } from "./completion";
import { currentRevision } from "./review";

export function listOwnedCourses(db: Db, ownerId: string): Promise<Course[]> {
  return db
    .select()
    .from(courses)
    .where(eq(courses.ownerId, ownerId))
    .orderBy(desc(courses.createdAt));
}

export type CourseListItem = Course & {
  completion: CourseCompletion | null;
  published: boolean;
};

export async function listOwnedCoursesWithCompletion(
  db: Db,
  ownerId: string,
): Promise<CourseListItem[]> {
  const owned = await listOwnedCourses(db, ownerId);
  return Promise.all(
    owned.map(async (course) => {
      const revision = await currentRevision(db, course.id);
      return {
        ...course,
        published: revision !== undefined,
        completion: revision ? await currentCourseCompletion(db, course.id) : null,
      };
    }),
  );
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
