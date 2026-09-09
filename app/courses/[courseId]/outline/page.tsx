import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CourseDesignProgress } from "@/components/course-design-progress";
import { CourseFailed } from "@/components/course-failed";
import { OutlineEditor } from "@/components/outline-editor";
import { db } from "@/lib/db";
import { findOwnedCourse } from "@/lib/db/courses";
import {
  latestDesignRun,
  latestOutline,
  listCourseSources,
  listDesignEvents,
} from "@/lib/db/design";
import { latestGenerationRun } from "@/lib/db/outline";
import { loadTailorHistory } from "@/lib/db/tailor";
import { findProposedPlanAction } from "@/lib/actions/tailor";
import { outlineToEditorCourse } from "@/lib/course/view";
import { turnViews } from "@/lib/course/tutor";
import { requireLearner } from "@/lib/session";
import type { ReactNode } from "react";

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function OutlinePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { user } = await requireLearner();
  const { courseId } = await params;
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) notFound();
  if (course.status === "ready") {
    redirect(`/courses/${courseId}`);
  }
  const shell = (node: ReactNode) => <AppShell section={course.topic}>{node}</AppShell>;

  if (course.status === "failed") {
    const outline = await latestOutline(db, courseId);
    const generation = outline ? await latestGenerationRun(db, courseId) : undefined;
    if (outline && generation) {
      return shell(
        <CourseFailed
          courseId={course.id}
          topic={course.topic}
          goal={course.goal}
          error={generation.error}
        />,
      );
    }
    const run = await latestDesignRun(db, courseId);
    return shell(
      <CourseDesignProgress
        courseId={course.id}
        topic={course.topic}
        goal={course.goal}
        status="failed"
        step={run?.currentStep ?? "sources"}
        error={run?.error ?? null}
      />,
    );
  }

  if (course.status === "designing") {
    const run = await latestDesignRun(db, courseId);
    const [events, sourceRows, preview] = await Promise.all([
      run ? listDesignEvents(db, courseId, run.id) : Promise.resolve([]),
      listCourseSources(db, courseId),
      latestOutline(db, courseId),
    ]);
    return shell(
      <CourseDesignProgress
        courseId={course.id}
        topic={course.topic}
        goal={course.goal}
        status="designing"
        step={run?.currentStep ?? "sources"}
        error={run?.error ?? null}
        startedAt={run?.startedAt.toISOString() ?? course.createdAt.toISOString()}
        events={events.map((e) => ({
          kind: e.kind,
          message: e.message,
          createdAt: e.createdAt.toISOString(),
        }))}
        sources={sourceRows.map((s) => ({ title: s.title, url: s.url, domain: domainOf(s.url) }))}
        preview={
          preview
            ? {
                modules: preview.data.modules.map((m) => ({
                  numeral: m.numeral,
                  title: m.title,
                  lessons: m.lessons.map((l) => ({
                    title: l.title,
                    summary: l.summary,
                    minutes: l.minutes,
                  })),
                })),
                terminalPerformances: preview.draft?.terminalPerformances ?? [],
                premise: preview.draft?.throughline.premise ?? null,
                runningExample: preview.draft?.throughline.runningExample ?? null,
              }
            : null
        }
      />,
    );
  }

  const outline = await latestOutline(db, courseId);
  if (!outline) notFound();

  if (course.status === "generating" || course.status === "reviewing") {
    const run = await latestGenerationRun(db, courseId);
    return shell(
      <OutlineEditor
        course={outlineToEditorCourse(course, outline.version, outline.data, course.status)}
        key={course.status}
        runStep={run?.currentStep ?? null}
      />,
    );
  }

  if (course.status !== "awaiting-outline-approval") notFound();

  return shell(
    <OutlineEditor
      course={outlineToEditorCourse(course, outline.version, outline.data)}
      tailorTurns={turnViews(await loadTailorHistory(db, user.id, courseId))}
      tailorPlan={await findProposedPlanAction(courseId)}
      onRefreshPlan={findProposedPlanAction.bind(null, courseId)}
    />,
  );
}
