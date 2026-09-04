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
import { requireLearner } from "@/lib/session";

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

  const stored = await loadTutorHistory(db, user.id, courseId);
  const tutorHistory: Record<string, { from: "learner" | "tutor"; text: string }[]> = {};
  for (const [lessonRef, turns] of stored) {
    tutorHistory[lessonRef] = turns.map((t) => ({ from: t.role, text: t.content }));
  }

  const tailorTurns = (await loadTailorHistory(db, user.id, courseId)).map((t) => ({
    from: t.role,
    text: t.content,
  }));
  const proposedPlan = await findProposedPlanAction(courseId);

  const searchStale = await searchIsIncomplete(db, courseId);

  return (
    <Workspace
      course={reading}
      sources={sources}
      onMark={markLessonDoneAction.bind(null, courseId)}
      onUnmark={markLessonUndoneAction.bind(null, courseId)}
      tutorHistory={tutorHistory}
      tailorTurns={tailorTurns}
      tailorPlan={proposedPlan}
      stagedPlan={await findStagedPlanAction(courseId)}
      searchStale={searchStale}
      onRefreshPlan={findProposedPlanAction.bind(null, courseId)}
    />
  );
}
