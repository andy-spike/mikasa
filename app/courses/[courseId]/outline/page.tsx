import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { CourseDesignProgress } from "@/components/course-design-progress";
import { CourseFailed } from "@/components/course-failed";
import { LessonRun, type RunFinding } from "@/components/lesson-run";
import { OutlineEditor } from "@/components/outline-editor";
import { db } from "@/lib/db";
import { findOwnedCourse } from "@/lib/db/courses";
import {
  findCourseSpec,
  latestDesignRun,
  latestOutline,
  listCourseSources,
  listDesignEvents,
} from "@/lib/db/design";
import { latestGenerationRun } from "@/lib/db/outline";
import { getFindings, latestReviewRun } from "@/lib/db/review";
import { lessons } from "@/lib/db/schema";
import { loadTailorHistory } from "@/lib/db/tailor";
import { findProposedPlanAction } from "@/lib/actions/tailor";
import { highlightReading } from "@/lib/course/highlight";
import { toReadingCourse, toSourceLinks } from "@/lib/course/reading";
import { outlineToEditorCourse } from "@/lib/course/view";
import { chatViews } from "@/lib/course/tutor";
import { requireLearner } from "@/lib/session";
import type { ReactNode } from "react";

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The measured design run, from its start to the Outline it produced. */
function draftedIn(startedAt: Date | undefined, outlineCreatedAt: Date): string | null {
  if (!startedAt) return null;
  const seconds = Math.max(
    0,
    Math.floor((outlineCreatedAt.getTime() - startedAt.getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
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

  /* The writing run and the check: the Lessons the writer has saved so far,
     the run's own step, and the findings of the round the check is on. */
  if (course.status === "generating" || course.status === "reviewing") {
    const run = await latestGenerationRun(db, courseId);
    const version = run?.outlineVersion ?? outline.version;
    const [lessonRows, review] = await Promise.all([
      db
        .select()
        .from(lessons)
        .where(and(eq(lessons.courseId, courseId), eq(lessons.outlineVersion, version))),
      latestReviewRun(db, courseId),
    ]);
    const [reading, findingRows] = await Promise.all([
      highlightReading(toReadingCourse(course, outline.data, lessonRows)),
      review ? getFindings(db, review.id, review.round) : Promise.resolve([]),
    ]);
    const findings: RunFinding[] = findingRows.map((finding) => ({
      id: finding.id,
      kind: finding.kind === "factual" ? "factual" : "structural",
      lessonRef: finding.lessonRef,
      detail: finding.detail,
      corrected: finding.status === "corrected",
    }));
    return shell(
      <LessonRun
        courseId={course.id}
        course={reading}
        status={course.status}
        runStep={run?.currentStep ?? null}
        startedAt={run?.startedAt.toISOString() ?? null}
        findings={findings}
      />,
    );
  }

  if (course.status !== "awaiting-outline-approval") notFound();

  const [sourceRows, spec, designRun, tailorChats, tailorPlan] = await Promise.all([
    listCourseSources(db, courseId),
    findCourseSpec(db, courseId, outline.version),
    latestDesignRun(db, courseId),
    loadTailorHistory(db, user.id, courseId),
    findProposedPlanAction(courseId),
  ]);

  return shell(
    <OutlineEditor
      course={outlineToEditorCourse(course, outline.version, outline.data)}
      sources={[...toSourceLinks(sourceRows).values()]}
      spec={{
        terminalPerformances: spec?.contract.terminalPerformances ?? [],
        premise: spec?.throughline.premise ?? null,
        runningExample: spec?.throughline.runningExample ?? null,
      }}
      draftedIn={
        designRun?.status === "succeeded" ? draftedIn(designRun.startedAt, outline.createdAt) : null
      }
      tailorTurns={chatViews(tailorChats).at(-1)?.turns ?? []}
      tailorPlan={tailorPlan}
      onRefreshPlan={findProposedPlanAction.bind(null, courseId)}
    />,
  );
}
