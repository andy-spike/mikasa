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
import { requireLearner } from "@/lib/session";

export default async function OutlinePage({ params }: PageProps<"/courses/[courseId]/outline">) {
  const { user } = await requireLearner();
  const { courseId } = await params;
  const course = await findOwnedCourse(db, user.id, courseId);
  if (!course) notFound();
  if (course.status === "ready") {
    redirect(`/courses/${courseId}`);
  }

  if (course.status === "failed") {
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
    const [events, sourceRows, preview] = await Promise.all([
      run ? listDesignEvents(db, courseId, run.id) : Promise.resolve([]),
      listCourseSources(db, courseId),
      latestOutline(db, courseId),
    ]);
    const domainOf = (url: string) => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return url;
      }
    };
    return (
      <AppShell section={course.topic}>
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
        />
      </AppShell>
    );
  }

  const outline = await latestOutline(db, courseId);
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
