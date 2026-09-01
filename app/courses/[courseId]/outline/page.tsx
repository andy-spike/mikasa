import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CourseDesignProgress } from "@/components/course-design-progress";
import { OutlineEditor } from "@/components/outline-editor";
import { db } from "@/lib/db";
import { findOwnedCourse } from "@/lib/db/courses";
import { latestDesignRun, latestOutline } from "@/lib/db/design";
import { outlineToLibraryCourse } from "@/lib/course/view";
import { requireLearner } from "@/lib/session";

/**
 * The Outline checkpoint. While design runs (or after it fails) this is the
 * progress screen; once the Course is awaiting approval, the same route is
 * the Outline editor the product has always had.
 */
export default async function OutlinePage({
  params,
}: PageProps<"/courses/[courseId]/outline">) {
  const { user } = await requireLearner();
  const { courseId } = await params;
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) notFound();

  if (course.status === "designing" || course.status === "failed") {
    const run = await latestDesignRun(db, courseId);
    return (
      <AppShell section={course.topic}>
        <CourseDesignProgress
          courseId={course.id}
          topic={course.topic}
          goal={course.goal}
          status={course.status === "failed" ? "failed" : "designing"}
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

  return (
    <AppShell section={course.topic}>
      <OutlineEditor course={outlineToLibraryCourse(course, outline.data)} />
    </AppShell>
  );
}
