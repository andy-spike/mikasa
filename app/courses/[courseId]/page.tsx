import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { db } from "@/lib/db";
import { findOwnedCourse } from "@/lib/db/courses";
import { findOwnedPublishedCourse } from "@/lib/db/review";
import { listCompletions } from "@/lib/db/completion";
import { searchIsIncomplete } from "@/lib/db/fragments";
import { loadTutorHistory } from "@/lib/db/tutor";
import { loadTailorHistory } from "@/lib/db/tailor";
import { markLessonDoneAction, markLessonUndoneAction } from "@/lib/actions/completion";
import { findProposedPlanAction, findStagedPlanAction } from "@/lib/actions/tailor";
import { toReadingCourse, toSourceLinks } from "@/lib/course/reading";
import { highlightReading } from "@/lib/course/highlight";
import { chatViews, type ChatView } from "@/lib/course/tutor";
import { requireLearner } from "@/lib/session";

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { user } = await requireLearner();
  const { courseId } = await params;
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) notFound();

  const published = await findOwnedPublishedCourse(db, user.id, courseId);
  if (!published) redirect(`/courses/${courseId}/outline`);

  const completions = await listCompletions(db, courseId);
  const reading = await highlightReading(
    toReadingCourse(published.course, published.outline.data, published.lessonRows, completions),
  );
  const sources = toSourceLinks(published.sourceRows);

  /* Every Lesson may hold several chats: the margin opens the newest and the
     rest wait behind Previous chats. */
  const stored = await loadTutorHistory(db, user.id, courseId);
  const tutorChats: Record<string, ChatView[]> = {};
  for (const [lessonRef, chats] of stored) {
    tutorChats[lessonRef] = chatViews(chats);
  }

  const tailorChats = chatViews(await loadTailorHistory(db, user.id, courseId));
  const proposedPlan = await findProposedPlanAction(courseId);
  const stagedPlan = await findStagedPlanAction(courseId);

  const searchStale = await searchIsIncomplete(db, courseId);

  return (
    <Workspace
      course={reading}
      sources={sources}
      onMark={markLessonDoneAction.bind(null, courseId)}
      onUnmark={markLessonUndoneAction.bind(null, courseId)}
      tutorChats={tutorChats}
      tailorChats={tailorChats}
      tailorPlan={proposedPlan}
      stagedPlan={stagedPlan}
      searchStale={searchStale}
      onRefreshPlan={findProposedPlanAction.bind(null, courseId)}
    />
  );
}
