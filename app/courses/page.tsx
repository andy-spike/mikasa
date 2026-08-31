import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LiveMark, UnsetMark } from "@/components/workspace/marks";
import { Button } from "@/components/ui/button";
import { library, stats } from "@/lib/demo-library";

export default function CoursesPage() {
  const rows = library.map((c) => ({ course: c, ...stats(c.modules) }));

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

        {/* Hairline-divided rows on the canvas. Not a grid of cards. */}
        <ul className="mt-8 border-t border-hair">
          {rows.map(({ course: c, total, done }) => (
            <li key={c.id} className="border-b border-hair">
              <Link
                href={c.phase === "reading" ? `/courses/${c.id}` : `/courses/${c.id}/outline`}
                className="row grid grid-cols-[0.75rem_1fr_auto] items-start gap-x-4 px-2 py-5 hover:bg-panel"
              >
                <span className="flex h-5 w-3 items-center justify-center">
                  {/* The accent still means one thing: where you are up to. */}
                  {c.phase === "reading" ? <LiveMark /> : <UnsetMark />}
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] leading-snug font-semibold tracking-[-0.011em] text-fg">
                    {c.topic}
                  </span>
                  <span className="mt-1.5 block truncate text-[0.8125rem] leading-[1.5] text-fg-3">
                    {c.goal}
                  </span>
                </span>

                <span className="tnum shrink-0 text-[0.8125rem] text-fg-3">
                  {c.phase === "reading" ? (
                    <>
                      <span className="text-fg-2">{done}</span>/{total}
                    </>
                  ) : (
                    "Outline"
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>

      </div>
    </AppShell>
  );
}
