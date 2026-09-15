"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReadingBlock, ReadingLesson, SourceLink } from "@/lib/course/reading";
import { useMediaQuery } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DoneCheck } from "./marks";
import { Inline, LessonBlock } from "./prose";

type NavTarget = { id: string; n: number; title: string };

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/* The text a quoted passage is matched against, whichever block it lands in. */
function blockText(block: ReadingBlock): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "code":
    case "sql":
      return [block.code, "caption" in block ? (block.caption ?? "") : ""].join(" ");
    case "table":
      return [block.head.join(" "), ...block.rows.flat(), block.caption].join(" ");
  }
}

function LessonNav({
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
      {backward && (
        <Icon
          className="h-4 w-4 shrink-0 text-fg-3 transition-transform duration-120 ease-expo group-hover:-translate-x-1"
          strokeWidth={1.75}
        />
      )}
      <span className="min-w-0">
        <span className="label block text-fg-dim">{backward ? "Previous" : "Next"}</span>
        <span className="mt-1 block truncate text-[0.9375rem] text-fg-2 group-hover:text-fg">
          <span className="tnum mr-2 text-fg-3">{nav.n}</span>
          {nav.title}
        </span>
      </span>
      {!backward && (
        <Icon
          className="ml-auto h-4 w-4 shrink-0 text-fg-3 transition-transform duration-120 ease-expo group-hover:translate-x-1"
          strokeWidth={1.75}
        />
      )}
    </Button>
  );
}

function ExerciseAction({
  stamp,
  striking,
  onMark,
  onUnmark,
}: {
  stamp: string | undefined;
  striking: boolean;
  onMark: () => void;
  onUnmark: () => void;
}) {
  if (!stamp) return <Button onClick={onMark}>Mark the Exercise done</Button>;
  return (
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
  );
}

type Props = {
  lesson: ReadingLesson & { n: number; moduleNumeral: string; moduleTitle: string };
  total: number;
  stamp?: string;
  striking: boolean;
  previous: NavTarget | null;
  next: NavTarget | null;
  sourceFor?: (ref: string) => SourceLink | undefined;
  /** A passage to find in the Lesson, bumped with a fresh token to fire again. */
  reveal?: { quote: string; token: number } | null;
  /** Called with a selected passage when the Learner asks about it. */
  onAskAbout?: (text: string) => void;
  onMark: () => void;
  onUnmark: () => void;
  onOpen: (id: string) => void;
};

export function LessonPane({
  lesson,
  total,
  stamp,
  striking,
  previous,
  next,
  sourceFor,
  reveal,
  onAskAbout,
  onMark,
  onUnmark,
  onOpen,
}: Props) {
  const articleRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<{ text: string; x: number; y: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  /* A selection inside the article raises the Ask control. */
  useEffect(() => {
    if (!onAskAbout) return;
    function readSelection() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPicked(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const article = articleRef.current;
      if (!article || !article.contains(range.commonAncestorContainer)) {
        setPicked(null);
        return;
      }
      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (text.length < 2) {
        setPicked(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPicked({
        text: text.slice(0, 600),
        x: Math.min(rect.right + 10, window.innerWidth - 152),
        y: Math.min(rect.bottom + 8, window.innerHeight - 44),
      });
    }
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [onAskAbout]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const clear = () => setPicked(null);
    el.addEventListener("scroll", clear, { passive: true });
    return () => el.removeEventListener("scroll", clear);
  }, []);

  /* A quoted passage in the Tutor thread finds its sentence and marks it. */
  useEffect(() => {
    if (!reveal) return;
    const article = articleRef.current;
    if (!article) return;
    const wanted = normalize(reveal.quote);
    if (!wanted) return;
    for (const el of article.querySelectorAll<HTMLElement>("[data-block]")) {
      if (normalize(el.dataset.block ?? "").includes(wanted)) {
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        setFlash(wanted);
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
        return;
      }
    }
  }, [reveal, reduce]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  return (
    <div ref={scrollRef} className="scroll-thin h-full overflow-y-auto">
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
          {lesson.body?.map((block, i) => {
            const text = normalize(blockText(block));
            return (
              <div
                key={i}
                data-block={text}
                className={cn(
                  "relative -mx-2 rounded-sm px-2 transition-colors duration-200",
                  flash !== null && text.includes(flash) && "bg-raised",
                )}
              >
                <LessonBlock block={block} sourceFor={sourceFor} />
              </div>
            );
          })}
        </div>

        {lesson.exercise && (
          <section className="mt-12 max-w-(--measure) border-t border-hair pt-7">
            <h3 className="label text-fg-3">Exercise</h3>
            <p className="mt-3.5 text-[1rem] leading-[1.7] text-fg">
              <Inline text={lesson.exercise.task} />
            </p>
            <p className="mt-3 text-[0.9375rem] leading-[1.62] text-fg-3">
              <Inline text={lesson.exercise.check} />
            </p>

            <div className="mt-7">
              <ExerciseAction
                stamp={stamp}
                striking={striking}
                onMark={onMark}
                onUnmark={onUnmark}
              />
            </div>
          </section>
        )}

        <footer
          className={cn(
            "mt-12 grid max-w-(--measure) gap-3 border-t border-hair pt-4",
            previous && next ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {previous && <LessonNav direction="previous" nav={previous} onOpen={onOpen} />}

          {next && <LessonNav direction="next" nav={next} onOpen={onOpen} />}
        </footer>
      </article>

      {picked && onAskAbout && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onAskAbout(picked.text);
            window.getSelection()?.removeAllRanges();
            setPicked(null);
          }}
          style={{ left: picked.x, top: picked.y }}
          className="lift fixed z-50 flex items-center gap-2 border border-hair bg-float px-2 py-1 text-[0.75rem] text-fg-2 transition-colors hover:text-fg"
        >
          <span aria-hidden className="block h-3.5 w-px bg-rule" />
          Ask the Tutor
        </button>
      )}
    </div>
  );
}
