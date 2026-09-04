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
