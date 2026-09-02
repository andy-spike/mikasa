import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CourseDesignProgress } from "@/components/course-design-progress";
import { CourseFailed } from "@/components/course-failed";
import { OutlineEditor } from "@/components/outline-editor";
import { db } from "@/lib/db";
import { findOwnedCourse } from "@/lib/db/courses";
import { latestDesignRun, latestOutline } from "@/lib/db/design";
import { latestGenerationRun } from "@/lib/db/outline";
import { loadTailorHistory } from "@/lib/db/tailor";
import { findProposedPlanAction } from "@/lib/actions/tailor";
import { outlineToEditorCourse } from "@/lib/course/view";
import { requireLearner } from "@/lib/session";

/**
 * The Outline checkpoint. While design runs (or after it fails) this is
 * the progress screen; at the checkpoint it is the Outline editor; once
 * approval opens generation it is the generating screen; and a Course
 * that failed after its Outline existed shows its failure here, with the
 * dispatching retry (ticket #7).
 */
export default async function OutlinePage({
  params,
}: PageProps<"/courses/[courseId]/outline">) {
  const { user } = await requireLearner();
  const { courseId } = await params;
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) notFound();
  if (course.status === "ready" || course.status === "reading") {
    redirect(`/courses/${courseId}`);
  }

  if (course.status === "failed") {
    /* A failure after design: the Outline exists and a generation run
       carries the error. Design failures keep the design screen. */
    const outline = await latestOutline(db, courseId);
    const generation = outline ? await latestGenerationRun(db, courseId) : undefined;
    if (outline && generation) {
      return (
        <AppShell section={course.topic}>
          <CourseFailed
            courseId={course.id}
            topic={course.topic}
            goal={course.goal}
            error={generation.error}
          />
        </AppShell>
      );
    }
    const run = await latestDesignRun(db, courseId);
    return (
      <AppShell section={course.topic}>
        <CourseDesignProgress
          courseId={course.id}
          topic={course.topic}
          goal={course.goal}
          status="failed"
          step={run?.currentStep ?? "sources"}
          error={run?.error ?? null}
        />
      </AppShell>
    );
  }

  if (course.status === "designing") {
    const run = await latestDesignRun(db, courseId);
    return (
      <AppShell section={course.topic}>
        <CourseDesignProgress
          courseId={course.id}
          topic={course.topic}
          goal={course.goal}
          status="designing"
          step={run?.currentStep ?? "sources"}
          error={run?.error ?? null}
        />
      </AppShell>
    );
  }

  const outline = await latestOutline(db, courseId);
  /* A Course past design always has Outline rows; without them there is
     nothing to checkpoint yet. */
  if (!outline) notFound();

  if (course.status === "generating" || course.status === "reviewing") {
    const run = await latestGenerationRun(db, courseId);
    return (
      <AppShell section={course.topic}>
        <OutlineEditor
          course={outlineToEditorCourse(
            course,
            outline.version,
            outline.data,
            course.status === "generating" ? "generating" : "reviewing",
          )}
          key={course.status}
          runStep={run?.currentStep ?? null}
        />
      </AppShell>
    );
  }

  if (course.status !== "awaiting-outline-approval") notFound();

  return (
    <AppShell section={course.topic}>
      <OutlineEditor
        course={outlineToEditorCourse(course, outline.version, outline.data)}
        tailorTurns={(await loadTailorHistory(db, user.id, courseId)).map((t) => ({
          from: t.role,
          text: t.content,
        }))}
        tailorPlan={await findProposedPlanAction(courseId)}
        onRefreshPlan={findProposedPlanAction.bind(null, courseId)}
      />
    </AppShell>
  );
}
