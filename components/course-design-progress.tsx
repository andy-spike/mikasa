"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CancelRunButton } from "@/components/cancel-run-button";
import { DoneCheck, UnsetMark } from "@/components/workspace/marks";
import { cancelDesignAction, retryCourseAction } from "@/lib/actions/courses";

const STEP_COPY: Record<string, string> = {
  sources: "Gathering sources.",
  outline: "Drafting the Modules and the Lesson titles.",
  specification: "Planning how the Lessons connect.",
  persist: "Saving the Outline.",
};

const STEPS = [
  { id: "sources", label: "Sources" },
  { id: "outline", label: "Outline" },
  { id: "specification", label: "Connections" },
  { id: "persist", label: "Saving" },
] as const;

export type DesignProgressEvent = {
  kind: string;
  message: string;
  createdAt: string;
};

export type DesignProgressSource = {
  title: string;
  url: string;
  domain: string;
};

export type DesignPreview = {
  modules: {
    numeral: string;
    title: string;
    lessons: { title: string; summary: string; minutes: number }[];
  }[];
  terminalPerformances: string[];
  premise: string | null;
  runningExample: string | null;
};

type Props = {
  courseId: string;
  topic: string;
  goal: string;
  status: "designing" | "failed";
  step: string;
  error: string | null;
  startedAt?: string;
  events?: DesignProgressEvent[];
  sources?: DesignProgressSource[];
  preview?: DesignPreview | null;
};

function formatElapsed(startedAt: string, now: number): string {
  const elapsed = Math.max(0, now - new Date(startedAt).getTime());
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

export function CourseDesignProgress({
  courseId,
  topic,
  goal,
  status,
  step,
  error,
  startedAt,
  events = [],
  sources = [],
  preview = null,
}: Props) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [cancelled, setCancelled] = useState(false);

  const designing = status === "designing" && !retrying;

  useEffect(() => {
    if (!designing || cancelled) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [designing, cancelled, router]);

  useEffect(() => {
    if (!designing || !startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [designing, startedAt]);

  const currentMessage = useMemo(() => {
    const last = events.length > 0 ? events[events.length - 1] : null;
    if (last?.message) return last.message;
    return STEP_COPY[step] ?? "Designing the Course.";
  }, [events, step]);

  const history = useMemo(() => events.slice(-4, -1).reverse(), [events]);

  const currentIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.id === step),
  );
  const numberedModules = useMemo(() => {
    if (!preview) return [];
    let n = 0;
    return preview.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({ ...l, n: ++n })),
    }));
  }, [preview]);
  const lessonTotal = numberedModules.reduce((n, m) => n + m.lessons.length, 0);

  function retry() {
    setRetrying(true);
    startTransition(async () => {
      await retryCourseAction(courseId);
      setRetrying(false);
      router.refresh();
    });
  }

  if (!designing) {
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

  return (
    <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8" aria-live="polite">
      <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
        {topic}
      </h1>
      <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">{goal}</p>

      <p className="mt-6 text-[0.9375rem] leading-[1.66] text-fg-2">{currentMessage}</p>
      <p className="tnum mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
        {startedAt ? `Working for ${formatElapsed(startedAt, now)}.` : null}
        {startedAt ? " " : ""}You can leave this page. The Outline will be here when you come back.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <CancelRunButton
          idleLabel="Cancel this Course"
          confirmLabel="Discard this Course?"
          pendingLabel="Discarding…"
          onConfirm={() => cancelDesignAction(courseId)}
          onDone={(result) => {
            if (result.ok) {
              setCancelled(true);
              router.push("/courses");
            } else router.refresh();
          }}
        />
        <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
          Back to Courses
        </Button>
      </div>

      <ol className="mt-6 border-t border-hair">
        {STEPS.map((s, i) => {
          const done = i < currentIndex;
          const doing = i === currentIndex;
          return (
            <li
              key={s.id}
              className="grid grid-cols-[0.75rem_1fr_auto] items-center gap-x-2 border-b border-hair px-2 py-1.5"
              aria-current={doing ? "true" : undefined}
            >
              <span className="flex h-4 w-3 items-center justify-center text-fg-3">
                {done ? <DoneCheck /> : <UnsetMark />}
              </span>
              <span
                className={
                  doing
                    ? "text-[0.8125rem] leading-5 font-medium text-fg"
                    : "text-[0.8125rem] leading-5 text-fg-2"
                }
              >
                {s.label}
              </span>
              <span className="text-[0.75rem] leading-[1.5] text-fg-3">
                {done ? "Done" : doing ? "Doing" : "Queued"}
              </span>
            </li>
          );
        })}
      </ol>

      {history.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {history.map((e, i) => (
            <li key={`${e.createdAt}-${i}`} className="text-[0.75rem] leading-[1.5] text-fg-3">
              {e.message}
            </li>
          ))}
        </ul>
      ) : null}

      {preview && preview.modules.length > 0 ? (
        <div className="mt-10">
          <p className="label text-fg-3">
            Outline taking shape
            {lessonTotal > 0 ? (
              <span className="tnum ml-2 font-normal normal-case tracking-normal">
                {lessonTotal} {lessonTotal === 1 ? "Lesson" : "Lessons"}
              </span>
            ) : null}
          </p>
          <div className="mt-4">
            {numberedModules.map((m) => (
              <section key={`${m.numeral}-${m.title}`} className="mb-7 last:mb-0">
                <div className="border-b border-hair pb-2">
                  <h2 className="label block truncate text-fg-3">
                    {m.numeral}. {m.title}
                  </h2>
                </div>
                <ul>
                  {m.lessons.map((l) => {
                    return (
                      <li
                        key={`${m.numeral}-${l.n}-${l.title}`}
                        className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-2.5 border-b border-hair px-2 py-3"
                      >
                        <span className="tnum pt-px text-[0.75rem] leading-5 text-fg-dim">
                          {l.n}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[0.8125rem] leading-5 font-medium text-fg">
                            {l.title}
                          </span>
                          <span className="mt-1 block text-[0.8125rem] leading-[1.5] text-fg-3">
                            {l.summary}
                          </span>
                        </span>
                        <span className="tnum pt-0.5 text-[0.75rem] leading-5 text-fg-dim">
                          {l.minutes}m
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-9 space-y-2.5" aria-hidden="true">
          {[10, 6, 8, 5, 9, 7, 4].map((w, i) => (
            <Skeleton
              key={i}
              className="h-4 rounded-sm bg-panel"
              style={{ width: `${w * 8 + 12}%` }}
            />
          ))}
        </div>
      )}

      {sources.length > 0 ? (
        <div className="mt-10">
          <p className="label text-fg-3">
            Sources
            <span className="tnum ml-2 font-normal normal-case tracking-normal">
              {sources.length}
            </span>
          </p>
          <ul className="mt-2 border-t border-hair">
            {sources.map((s) => (
              <li key={s.url} className="border-b border-hair px-2 py-2">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-[0.8125rem] leading-5 text-fg-2 hover:text-fg"
                >
                  {s.title}
                </a>
                <span className="tnum mt-0.5 block truncate text-[0.75rem] leading-[1.5] text-fg-dim">
                  {s.domain}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview &&
      (preview.terminalPerformances.length > 0 || preview.premise || preview.runningExample) ? (
        <details className="group mt-10 border-t border-hair pt-6">
          <summary className="label cursor-pointer text-fg-3 hover:text-fg">Why this shape</summary>
          {preview.terminalPerformances.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {preview.terminalPerformances.map((p) => (
                <li key={p} className="text-[0.8125rem] leading-[1.6] text-fg-2">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.premise ? (
            <p className="mt-3 max-w-(--measure) text-[0.8125rem] leading-[1.6] text-fg-3">
              {preview.premise}
              {preview.runningExample ? ` Running example: ${preview.runningExample}` : ""}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
