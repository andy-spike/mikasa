"use client";

import { ArrowRight } from "lucide-react";
import type { Lesson as LessonType } from "@/lib/demo-course";
import { Button } from "@/components/ui/button";
import { DoneCheck } from "./marks";
import { Inline, LessonBlock } from "./prose";

type Props = {
  lesson: LessonType & { n: number; moduleNumeral: string; moduleTitle: string };
  total: number;
  stamp?: string;
  /** true only on the Lesson just marked, so the check strokes once */
  striking: boolean;
  next: { id: string; n: number; title: string } | null;
  onMark: () => void;
  onUnmark: () => void;
  onOpen: (id: string) => void;
};

export function LessonPane({
  lesson,
  total,
  stamp,
  striking,
  next,
  onMark,
  onUnmark,
  onOpen,
}: Props) {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      {/* 41rem = the 36rem measure plus symmetric padding, so the visible
          text column sits exactly on the article's centre line — the same
          line the centred search bar tracks. */}
      <article className="mx-auto w-full max-w-[41rem] px-5 pt-6 pb-20 sm:px-8 sm:pt-9 lg:px-10">
        <p className="tnum text-[0.75rem] text-fg-3">
          Lesson {lesson.n} of {total}
        </p>

        <h2 className="mt-2.5 max-w-[22ch] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance text-fg sm:text-[2.25rem]">
          {lesson.title}
        </h2>

        <div className="mt-9 space-y-6">
          {lesson.body?.map((block, i) => (
            <LessonBlock key={i} block={block} />
          ))}
        </div>

        {lesson.exercise ? (
          <section className="mt-12 max-w-(--measure) border-t border-hair pt-7">
            <h3 className="label text-fg-3">Exercise</h3>
            <p className="mt-3.5 text-[1rem] leading-[1.7] text-fg">
              <Inline text={lesson.exercise.task} />
            </p>
            <p className="mt-3 text-[0.9375rem] leading-[1.62] text-fg-3">
              <Inline text={lesson.exercise.check} />
            </p>

            <div className="mt-7">
              {stamp ? (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="flex items-center gap-2 rounded-sm bg-panel px-3 py-2 text-[0.8125rem] text-fg-2">
                    <span className="text-fg-2">
                      <DoneCheck striking={striking} />
                    </span>
                    Done <span className="tnum text-fg-3">{stamp}</span>
                  </span>
                  <Button variant="quiet" onClick={onUnmark}>
                    Undo
                  </Button>
                </div>
              ) : (
                <Button onClick={onMark}>Mark the Exercise done</Button>
              )}
            </div>
          </section>
        ) : null}

        <footer className="mt-12 max-w-(--measure) border-t border-hair pt-4">
          {next ? (
            <Button
              variant="bare"
              onClick={() => onOpen(next.id)}
              className="group flex w-full max-w-(--measure) items-center gap-3 px-3 py-3 text-left hover:bg-panel"
            >
              <span className="min-w-0">
                <span className="label block text-fg-dim">Next</span>
                <span className="mt-1 block truncate text-[0.9375rem] text-fg-2 group-hover:text-fg">
                  <span className="tnum mr-2 text-fg-3">{next.n}</span>
                  {next.title}
                </span>
              </span>
              <ArrowRight
                className="ml-auto h-4 w-4 shrink-0 text-fg-3 transition-transform duration-200 group-hover:translate-x-1"
                strokeWidth={1.75}
              />
            </Button>
          ) : (
            <p className="px-3 py-3 text-[0.9375rem] text-fg-3">
              This is the last Lesson in the Course.
            </p>
          )}
        </footer>
      </article>
    </div>
  );
}
