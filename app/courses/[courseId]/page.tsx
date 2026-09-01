import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { db } from "@/lib/db";
import { findOwnedCourse } from "@/lib/db/courses";
import { findOwnedPublishedCourse } from "@/lib/db/review";
import { listCompletions } from "@/lib/db/completion";
import { markLessonDoneAction, markLessonUndoneAction } from "@/lib/actions/completion";
import { toReadingCourse, toSourceLinks } from "@/lib/course/reading";
import { requireLearner } from "@/lib/session";

/**
 * The reading workspace, over the current published revision, with the
 * Learner's own Completion restored (ticket #8). A Course still on its way
 * (designing, at the Outline, generating, reviewing, failed) opens at its
 * Outline route, which renders the right stage; only a published Course
 * reads here, and only through its newest revision.
 */
export default async function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  const { user } = await requireLearner();
  const { courseId } = await params;
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) notFound();

  const published = await findOwnedPublishedCourse(db, user.id, courseId);
  if (!published) redirect(`/courses/${courseId}/outline`);

  const completions = await listCompletions(db, courseId);
  const reading = toReadingCourse(
    published.course,
    published.outline.data,
    published.lessonRows,
    completions,
  );
  const sources = toSourceLinks(published.sourceRows);

  return (
    <Workspace
      course={reading}
      sources={sources}
      onMark={(lessonId) => markLessonDoneAction(courseId, lessonId)}
      onUnmark={(lessonId) => markLessonUndoneAction(courseId, lessonId)}
    />
  );
}
