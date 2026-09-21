"use client";

import { useEffect, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReadingLesson, SourceLink } from "@/lib/course/reading";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { BarCover } from "./bar-cover";
import { DoneCheck } from "./marks";
import { Inline, LessonBlock } from "./prose";

type NavTarget = { id: string; n: number; title: string };

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/* The text a quoted passage is matched against, whichever block it lands in. */
function blockText(block: ReadingLesson["body"][number]): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "code":
    case "sql":
      return [block.code, "caption" in block ? (block.caption ?? "") : ""].join(" ");
    case "table":
      return [block.head.join(" "), ...block.rows.flat(), block.caption].join(" ");
    default:
      return "";
  }
}

function NavButton({
  direction,
  nav,
  onOpen,
}: {
  direction: "previous" | "next";
  nav: NavTarget;
  onOpen: (id: string) => void;
}) {
  const backward = direction === "previous";
  const Icon = backward ? ArrowLeft : ArrowRight;
  return (
    <Button
      variant="bare"
      onClick={() => onOpen(nav.id)}
      className="group flex min-w-0 items-center gap-3 px-3 py-3 text-left hover:bg-panel"
    >
      {backward ? (
        <Icon
          className="h-4 w-4 shrink-0 text-fg-3 transition-transform duration-120 ease-expo group-hover:-translate-x-1"
          strokeWidth={1.75}
        />
      ) : null}
      <span className="min-w-0">
        <span className="label block text-fg-dim">{backward ? "Previous" : "Next"}</span>
        <span className="mt-1 block truncate text-[0.9375rem] text-fg-2 group-hover:text-fg">
          <span className="tnum mr-2 text-fg-3">{nav.n}</span>
          {nav.title}
        </span>
      </span>
      {!backward ? (
        <Icon
          className="ml-auto h-4 w-4 shrink-0 text-fg-3 transition-transform duration-120 ease-expo group-hover:translate-x-1"
          strokeWidth={1.75}
        />
      ) : null}
    </Button>
  );
}

type Props = {
  lesson: ReadingLesson & { n: number };
  total: number;
  stamp?: string;
  striking: boolean;
  /** The passages this Lesson's Tutor threads grew from; each block that holds
      one is addressable by Show in the Lesson. */
  anchors: string[];
  previous: NavTarget | null;
  next: NavTarget | null;
  sourceFor?: (ref: string) => SourceLink | undefined;
  reveal: { quote: string; token: number } | null;
  portRef: RefObject<HTMLDivElement | null>;
  articleRef: RefObject<HTMLElement | null>;
  onMark: () => void;
  onUnmark: () => void;
  onOpen: (id: string) => void;
};

export function LessonPane({
  lesson,
  total,
  stamp,
  striking,
  anchors,
  previous,
  next,
  sourceFor,
  reveal,
  portRef,
  articleRef,
  onMark,
  onUnmark,
  onOpen,
}: Props) {
  const reduce = usePrefersReducedMotion();
  const [flash, setFlash] = useState<string | null>(null);

  /* Show in the Lesson: the passage a margin thread grew from is found in the
     text, brought to the middle, and flashes so the eye can land on it. */
  useEffect(() => {
    if (!reveal) return;
    const article = articleRef.current;
    if (!article) return;
    for (const el of article.querySelectorAll<HTMLElement>("[data-quote]")) {
      if (el.dataset.quote && normalize(el.dataset.quote) === normalize(reveal.quote)) {
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        setFlash(reveal.quote);
        const timer = window.setTimeout(() => setFlash(null), 1400);
        return () => window.clearTimeout(timer);
      }
    }
  }, [reveal, articleRef, reduce]);

  function quoteFor(block: ReadingLesson["body"][number]): string | null {
    const text = normalize(blockText(block));
    return anchors.find((anchor) => text.includes(normalize(anchor))) ?? null;
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={portRef} className="scroll-thin h-full overflow-y-auto [scrollbar-gutter:stable]">
        <article
          ref={articleRef}
          className="mx-auto w-full max-w-[41rem] px-5 pt-6 pb-20 sm:px-8 sm:pt-9 lg:px-10"
        >
          <p className="tnum text-[0.75rem] text-fg-3">
            Lesson {lesson.n} of {total}
          </p>

          <h2 className="mt-2.5 max-w-[22ch] text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-balance text-fg sm:text-[2.25rem]">
            {lesson.title}
          </h2>

          <div className="mt-9 space-y-6">
            {lesson.body.map((block, i) => {
              const quote = quoteFor(block);
              const flashed = Boolean(quote && flash && normalize(quote) === normalize(flash));
              return (
                <div
                  key={i}
                  data-quote={quote ?? undefined}
                  className={cn(
                    "relative -mx-2 rounded-sm px-2 transition-colors duration-200",
                    flashed && "bg-raised",
                  )}
                >
                  <LessonBlock block={block} sourceFor={sourceFor} />
                </div>
              );
            })}
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

          <footer
            className={cn(
              "mt-12 grid max-w-(--measure) gap-3 border-t border-hair pt-4",
              previous && next ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {previous ? <NavButton direction="previous" nav={previous} onOpen={onOpen} /> : null}
            {next ? <NavButton direction="next" nav={next} onOpen={onOpen} /> : null}
          </footer>
        </article>
      </div>
      <BarCover ground="canvas" />
    </div>
  );
}
