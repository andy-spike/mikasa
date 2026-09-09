import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CourseRowMenu } from "@/components/course-row-menu";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import { Button } from "@/components/ui/button";
import { listOwnedCoursesWithCompletion } from "@/lib/db/courses";
import { db } from "@/lib/db";
import { requireLearner } from "@/lib/session";

function rowFor(course: { id: string; status: string; published: boolean }): {
  href: string;
  label: string;
  reading: boolean;
} {
  if (course.published || course.status === "ready") {
    return { href: `/courses/${course.id}`, label: "", reading: true };
  }
  if (course.status === "awaiting-outline-approval") {
    return { href: `/courses/${course.id}/outline`, label: "Outline", reading: false };
  }
  if (course.status === "designing") {
    return { href: `/courses/${course.id}/outline`, label: "Designing", reading: false };
  }
  if (course.status === "failed") {
    return { href: `/courses/${course.id}/outline`, label: "Failed", reading: false };
  }
  if (course.status === "reviewing") {
    return { href: `/courses/${course.id}/outline`, label: "Reviewing", reading: false };
  }
  return { href: `/courses/${course.id}/outline`, label: "Generating", reading: false };
}

export default async function CoursesPage() {
  const { user } = await requireLearner();
  const owned = await listOwnedCoursesWithCompletion(db, user.id);

  return (
    <AppShell section="Courses">
      <div className="mx-auto w-full max-w-[52rem] px-5 pt-10 pb-24 sm:px-8">
        <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
          Courses
        </h1>

        {owned.length === 0 ? (
          <div className="mt-8 border-t border-hair pt-10">
            <p className="text-[0.9375rem] leading-[1.66] text-fg-2">No Courses yet.</p>
            <p className="mt-2 max-w-(--measure) text-[0.8125rem] leading-[1.55] text-fg-3">
              Name a Topic and a Goal, and Mikasa drafts the Outline. You shape it before a Lesson
              is written.
            </p>
            <Button variant="hero" render={<Link href="/courses/new" />} className="mt-6">
              Start a Course
            </Button>
          </div>
        ) : (
          <ul className="mt-8 border-t border-hair">
            {owned.map((c) => {
              const { href, label, reading } = rowFor(c);
              const complete = reading && c.completion && c.completion.done >= c.completion.total;
              return (
                <li key={c.id} className="group relative border-b border-hair hover:bg-panel">
                  <Link
                    href={href}
                    className="row grid grid-cols-[0.75rem_1fr_auto] items-start gap-x-4 px-2 py-5"
                  >
                    <span className="flex h-5 w-3 items-center justify-center">
                      {reading ? (
                        complete ? (
                          <span className="text-fg-3">
                            <DoneCheck />
                          </span>
                        ) : (
                          <LiveMark />
                        )
                      ) : (
                        <UnsetMark />
                      )}
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
                        {c.topic}
                      </span>
                      <span className="mt-1.5 block truncate text-[0.8125rem] leading-[1.5] text-fg-3">
                        {c.goal}
                      </span>
                    </span>

                    <span className="tnum shrink-0 pr-10 text-[0.8125rem] text-fg-3">
                      {reading && c.completion
                        ? `${c.completion.done} / ${c.completion.total}`
                        : label}
                    </span>
                  </Link>

                  <div className="absolute top-4 right-2">
                    <CourseRowMenu courseId={c.id} topic={c.topic} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {owned.length > 0 ? (
        <Button
          variant="hero"
          render={<Link href="/courses/new" />}
          aria-label="New Course"
          title="New Course"
          className="new-course-button fixed right-5 bottom-5 z-20 h-11 gap-0 px-3 sm:right-8 sm:bottom-8"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          <span className="new-course-label">New Course</span>
        </Button>
      ) : null}
    </AppShell>
  );
}
