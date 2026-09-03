/**
 * Course queries. Every function takes the Drizzle instance and the
 * Learner, so ownership is enforced in the query, not by the caller.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./index";
import { courses, type Course } from "./schema";
import { currentCourseCompletion, type CourseCompletion } from "./completion";
import { currentRevision } from "./review";

/** Every Course this Learner owns, newest first. Nobody else's, ever. */
export function listOwnedCourses(db: Db, ownerId: string): Promise<Course[]> {
  return db
    .select()
    .from(courses)
    .where(eq(courses.ownerId, ownerId))
    .orderBy(desc(courses.createdAt));
}

export type CourseListItem = Course & {
  /** The current revision's Completion; null before a revision exists. */
  completion: CourseCompletion | null;
  /** Whether the Course has a published revision to read. */
  published: boolean;
};

/**
 * Every owned Course with Completion for its current published revision.
 * The queries ride per Course (revision, outline, completions — three to
 * four per row); fine at prototype scale, revisit if libraries grow.
 */
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

/** One Course by id, or undefined unless it belongs to this Learner. */
export function findOwnedCourse(db: Db, ownerId: string, id: string): Promise<Course | undefined> {
  return db
    .select()
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, id)))
    .limit(1)
    .then((rows) => rows[0]);
}
