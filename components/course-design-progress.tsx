"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { retryCourseAction } from "@/lib/actions/courses";

const STEP_COPY: Record<string, string> = {
  sources: "Gathering sources.",
  outline: "Drafting the Modules and the Lesson titles.",
  specification: "Planning how the Lessons connect.",
  persist: "Saving the Outline.",
};

type Props = {
  courseId: string;
  topic: string;
  goal: string;
  status: "designing" | "failed";
  step: string;
  error: string | null;
};

export function CourseDesignProgress({ courseId, topic, goal, status, step, error }: Props) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [, startTransition] = useTransition();

  const designing = status === "designing" && !retrying;

  useEffect(() => {
    if (!designing) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [designing, router]);

  function retry() {
    setRetrying(true);
    startTransition(async () => {
      await retryCourseAction(courseId);
      setRetrying(false);
      router.refresh();
    });
  }

  if (designing) {
    return (
      <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8" aria-live="polite">
        <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
          {topic}
        </h1>
        <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">{goal}</p>
        <p className="mt-6 text-[0.9375rem] leading-[1.66] text-fg-2">
          {STEP_COPY[step] ?? "Designing the Course."}
        </p>
        <p className="mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
          You can leave this page. The Outline will be here when you come back.
        </p>
        <div className="mt-9 space-y-2.5">
          {[10, 6, 8, 5, 9, 7, 4].map((w, i) => (
            <Skeleton
              key={i}
              className="h-4 rounded-sm bg-panel"
              style={{ width: `${w * 8 + 12}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8" aria-live="polite">
      <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
        {topic}
      </h1>
      <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">{goal}</p>
      <div className="mt-8 border-t border-hair pt-6">
        <p className="label text-fg-3">Design failed</p>
        <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
          {error ?? "The design did not finish."}
        </p>
        <p className="mt-2 max-w-(--measure) text-[0.75rem] leading-[1.5] text-fg-3">
          Nothing was written. Designing again starts from the Topic, the Goal and this
          Course&rsquo;s settings.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button onClick={retry} disabled={retrying}>
            {retrying ? "Starting again…" : "Design again"}
          </Button>
          <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
            Back to Courses
          </Button>
        </div>
      </div>
    </div>
  );
}
