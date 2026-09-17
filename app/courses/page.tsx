import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CourseLibrary } from "@/components/course-library";
import { Button } from "@/components/ui/button";
import { buildCourseLibrary } from "@/lib/course/library";
import { db } from "@/lib/db";
import { listOwnedCoursesForIndex } from "@/lib/db/courses";
import { requireLearner } from "@/lib/session";

export default async function CoursesPage() {
  const { user } = await requireLearner();
  const items = buildCourseLibrary(await listOwnedCoursesForIndex(db, user.id));

  return (
    <AppShell section="Courses">
      {items.length === 0 ? (
        <div className="mx-auto w-full max-w-[52rem] px-5 pt-10 pb-24 sm:px-8">
          <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
            Courses
          </h1>

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
        </div>
      ) : (
        <>
          <CourseLibrary items={items} />

          {/* The New Course button slides its own label out on hover, so no hint.
              From lg up the index head carries the control instead. */}
          <Button
            variant="hero"
            render={<Link href="/courses/new" />}
            aria-label="New Course"
            className="new-course-button fixed right-5 bottom-5 z-20 h-11 gap-0 px-3 sm:right-8 sm:bottom-8 lg:hidden"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            <span className="new-course-label">New Course</span>
          </Button>
        </>
      )}
    </AppShell>
  );
}
