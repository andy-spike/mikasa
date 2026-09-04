"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { retryCourseAction } from "@/lib/actions/courses";

export function CourseFailed({
  courseId,
  topic,
  goal,
  error,
}: {
  courseId: string;
  topic: string;
  goal: string;
  error: string | null;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function retry() {
    setRetrying(true);
    setMessage(null);
    startTransition(async () => {
      const result = await retryCourseAction(courseId);
      if (result.ok) {
        router.refresh();
      } else {
        setMessage(result.errors.form ?? "The retry could not start.");
        setRetrying(false);
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8" aria-live="polite">
      <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
        {topic}
      </h1>
      <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">{goal}</p>
      <div className="mt-8 border-t border-hair pt-6">
        <p className="label text-fg-3">The Course did not finish</p>
        <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
          {error ?? "Something went wrong while the Course was being built."}
        </p>
        <p className="mt-2 max-w-(--measure) text-[0.75rem] leading-[1.5] text-fg-3">
          Everything already written is kept. Retrying picks up where this run stopped.
        </p>
        {message ? (
          <p role="alert" className="mt-3 text-[0.8125rem] leading-[1.5] text-fg-2">
            {message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button onClick={retry} disabled={retrying}>
            {retrying ? "Starting again…" : "Retry"}
          </Button>
          <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
            Back to Courses
          </Button>
        </div>
      </div>
    </div>
  );
}
