import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { db } from "@/lib/db";
import { findOwnedCourse } from "@/lib/db/courses";
import { requireLearner } from "@/lib/session";

/**
 * The reading workspace. Until Lesson generation exists (later tickets) a
 * real Course stops at its Outline; the workspace still opens for a Course
 * that has reached "ready" (and legacy "reading" rows from before design
 * state was introduced).
 */
const READING = new Set(["ready", "reading"]);

export default async function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  const { user } = await requireLearner();
  const { courseId } = await params;
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) notFound();
  /* A Course whose Lessons have not been generated has nothing to open. It
     stops at its Outline, which is the whole point of the checkpoint. */
  if (!READING.has(course.status)) redirect(`/courses/${courseId}/outline`);

  return <Workspace />;
}
