import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { findCourse } from "@/lib/demo-library";
import { requireLearner } from "@/lib/session";

export default async function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  await requireLearner();
  const { courseId } = await params;
  const course = findCourse(courseId);
  if (!course) notFound();
  /* A Course whose Lessons have not been generated has nothing to open. It
     stops at its Outline, which is the whole point of the checkpoint. */
  if (course.phase !== "reading") redirect(`/courses/${courseId}/outline`);

  return <Workspace />;
}
