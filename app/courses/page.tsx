import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DoneCheck, LiveMark, UnsetMark } from "@/components/workspace/marks";
import { Button } from "@/components/ui/button";
import { listOwnedCoursesWithCompletion } from "@/lib/db/courses";
import { db } from "@/lib/db";
import { requireLearner } from "@/lib/session";

/**
 * The one fact a library row adds: where the Course is in its life. A
 * Course with a published revision reads in the workspace, whatever the
 * status string says — the list is the one screen that must never hide a
 * readable Course (bug 1's defensive guard); everything else happens on
 * the Outline — designing, failed, or waiting for approval.
 */
function rowFor(course: {
  id: string;
  status: string;
  published: boolean;
}): { href: string; label: string; reading: boolean } {
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
  // Generating and reviewing are distinct documented states with their
  // own screens; the list names each one honestly.
  if (course.status === "reviewing") {
    return { href: `/courses/${course.id}/outline`, label: "Reviewing", reading: false };
  }
  return { href: `/courses/${course.id}/outline`, label: "Generating", reading: false };
}

export default async function CoursesPage() {
  const { user } = await requireLearner();
  const owned = await listOwnedCoursesWithCompletion(db, user.id);

  return (
    <AppShell
      section="Courses"
      actions={
        <Button variant="compact" render={<Link href="/courses/new" />} className="mr-1">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          New Course
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-[52rem] px-5 pt-10 pb-24 sm:px-8">
        <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
          Courses
        </h1>

        {owned.length === 0 ? (
          <div className="mt-8 border-t border-hair pt-10">
            <p className="text-[0.9375rem] leading-[1.66] text-fg-2">
              No Courses yet.
            </p>
            <p className="mt-2 max-w-(--measure) text-[0.8125rem] leading-[1.55] text-fg-3">
              Name a Topic and a Goal, and Mikasa drafts the Outline. You shape
              it before a Lesson is written.
            </p>
            <Button variant="hero" render={<Link href="/courses/new" />} className="mt-6">
              Start a Course
            </Button>
          </div>
        ) : (
          /* Hairline-divided rows on the canvas. Not a grid of cards. */
          <ul className="mt-8 border-t border-hair">
            {owned.map((c) => {
              const { href, label, reading } = rowFor(c);
              /* The accent marks where you are up to: a readable Course
                 with every Exercise done carries the neutral check. */
              const complete =
                reading && c.completion && c.completion.done >= c.completion.total;
              return (
                <li key={c.id} className="border-b border-hair">
                  <Link
                    href={href}
                    className="row grid grid-cols-[0.75rem_1fr_auto] items-start gap-x-4 px-2 py-5 hover:bg-panel"
                  >
                    <span className="flex h-5 w-3 items-center justify-center">
                      {/* The accent still means one thing: where you are up to. */}
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

                    {/* A published Course shows Completion; earlier Course work
                        keeps its lifecycle text. A published Course always
                        has a revision, so the label never shows here. */}
                    <span className="tnum shrink-0 text-[0.8125rem] text-fg-3">
                      {reading && c.completion
                        ? `${c.completion.done} / ${c.completion.total}`
                        : label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

      </div>
    </AppShell>
  );
}
