/**
 * Course queries. Every function takes the Drizzle instance and the
 * Learner, so ownership is enforced in the query, not by the caller.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./index";
import { courses, type Course } from "./schema";
import { currentCourseCompletion, type CourseCompletion } from "./completion";

/** Every Course this Learner owns, newest first. Nobody else's, ever. */
export function listOwnedCourses(db: Db, ownerId: string): Promise<Course[]> {
  return db
    .select()
    .from(courses)
    .where(eq(courses.ownerId, ownerId))
    .orderBy(desc(courses.createdAt));
}

export type CourseListItem = Course & { completion: CourseCompletion };

/** Every owned Course with Completion for its current published revision. */
export async function listOwnedCoursesWithCompletion(
  db: Db,
  ownerId: string,
): Promise<CourseListItem[]> {
  const owned = await listOwnedCourses(db, ownerId);
  return Promise.all(
    owned.map(async (course) => ({
      ...course,
      completion: await currentCourseCompletion(db, course.id),
    })),
  );
}

/** One Course by id, or undefined unless it belongs to this Learner. */
export function findOwnedCourse(
  db: Db,
  ownerId: string,
  id: string,
): Promise<Course | undefined> {
  return db
    .select()
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, id)))
    .limit(1)
    .then((rows) => rows[0]);
}
