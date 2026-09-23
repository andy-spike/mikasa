"use client";

import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveMark } from "@/components/workspace/marks";
import { courseExamples } from "@/components/landing-course-demo";
import { ExerciseReveal } from "@/components/landing-motion";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

/* Guided walk as a scroll: five steps, one per section, each clear on its
   own. The subject tabs stay sticky so the example can change at any point
   while scrolling; animated blocks remount on subject change and replay once.
   One olive mark only: the outline approval line. Content renders without
   scripts; Motion and CSS only enhance arrivals. */

const walkIndex = [
  { numeral: "01", title: "Your Goal", href: "#walk-step-1" },
  { numeral: "02", title: "Your Outline", href: "#walk-step-2" },
  { numeral: "03", title: "One Lesson", href: "#walk-step-3" },
  { numeral: "04", title: "Help & changes", href: "#walk-step-4" },
  { numeral: "05", title: "Begin", href: "#walk-step-5" },
] as const;

function StepShell({
  numeral,
  step,
  label,
  flip = false,
  children,
}: {
  numeral: string;
  step: string;
  label: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`walk-step-${step}`}
      aria-labelledby={`walk-step-${step}-title`}
      className="scroll-mt-[9rem] border-t border-hair py-16 sm:py-24"
    >
      <Reveal
        className={cn(
          "grid items-baseline gap-3 max-sm:grid-cols-[2rem_1fr]",
          flip ? "sm:grid-cols-[1fr_2.5rem]" : "sm:grid-cols-[2.5rem_1fr]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "tnum font-mono text-[0.8125rem] text-fg-3",
            flip && "sm:order-2 sm:text-right",
          )}
        >
          {numeral}
        </span>
        <div className={cn("min-w-0 max-w-xl", flip && "sm:order-1 sm:justify-self-end")}>
          <p className="label text-fg-3">{label}</p>
          <div className="mt-3">{children}</div>
        </div>
      </Reveal>
    </section>
  );
}

export function LandingWalk({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (index: number) => void;
}) {
  const example = courseExamples[selected];

  return (
    <section
      id="walk"
      aria-labelledby="walk-title"
      className="scroll-mt-[5.5rem] border-t border-hair pt-10 max-sm:pt-8"
    >
      <div className="flex items-end justify-between gap-8 max-sm:block">
        <h2
          id="walk-title"
          className="max-w-[36rem] text-[1.875rem] leading-[1.16] font-medium tracking-[-0.026em] text-balance"
        >
          One course,
          <br />
          five steps.
        </h2>
        <p className="max-w-[19rem] text-[0.9375rem] leading-[1.66] text-fg-3 max-sm:mt-4">
          Scroll through it one step at a time. Choose a subject to see how a specific goal becomes
          a path you can follow.
        </p>
      </div>

      <div className="sticky top-[3.5rem] z-20 mt-10 -mx-5 border-y border-hair bg-canvas/90 backdrop-blur sm:-mx-8 lg:-mx-10">
        <div className="mx-auto flex max-w-[77rem] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10 max-sm:block max-sm:px-5">
          <div className="flex max-sm:w-full" role="group" aria-label="Example course subject">
            {courseExamples.map((item, index) => (
              <Button
                key={item.topic}
                variant="bare"
                aria-pressed={selected === index}
                onClick={() => onSelect(index)}
                className="flex min-h-14 cursor-pointer items-center justify-between gap-8 px-5 py-3.5 text-sm text-fg-3 transition-colors hover:bg-panel hover:text-fg aria-pressed:bg-panel aria-pressed:text-fg aria-pressed:shadow-[inset_0_-2px_var(--fg)] max-sm:flex-1 max-sm:justify-center max-sm:gap-[0.4rem] max-sm:px-2 max-sm:py-3 max-sm:text-xs [&_svg]:transition-transform [&_svg]:duration-[240ms] [&_svg]:ease-expo aria-pressed:[&_svg]:rotate-45"
              >
                {item.topic}
                <ArrowUpRight size={14} aria-hidden="true" />
              </Button>
            ))}
          </div>
          <span className="tnum shrink-0 py-2 text-xs text-fg-3 max-sm:block max-sm:py-3">
            Illustrative courses
          </span>
        </div>
      </div>

      <nav aria-label="Walk steps" className="mt-2">
        <ol className="flex flex-wrap gap-x-1 gap-y-1 py-4">
          {walkIndex.map((step) => (
            <li key={step.numeral} className="flex min-h-11 items-center">
              <a
                href={step.href}
                className="tnum flex min-h-11 items-center gap-2.5 rounded-sm px-3.5 font-mono text-xs text-fg-3 transition-colors hover:bg-panel hover:text-fg"
              >
                <span aria-hidden="true">{step.numeral}</span>
                <span className="font-sans text-[0.8125rem] font-medium">{step.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <ol className="m-0 list-none p-0">
        <li>
          <StepShell numeral="01" step="1" label="Start with your goal">
            <h3
              id="walk-step-1-title"
              className="text-[1.75rem] leading-[1.2] font-medium tracking-[-0.026em] text-balance max-sm:text-2xl"
            >
              {example.goal}
            </h3>
            <div key={example.topic} className="animate-[course-assemble_480ms_var(--ease)_both]">
              <p className="mt-2.5 text-sm leading-[1.66] text-fg-2">{example.background}</p>
              <p className="tnum mt-2.5 text-xs text-fg-3">Depth · Reach the Goal</p>
            </div>
            <p className="mt-6 max-w-[36rem] text-[0.8125rem] leading-[1.55] text-fg-3">
              Name what you want to do. Add your Background, pick a Depth, and set the Course
              Language.
            </p>
          </StepShell>
        </li>

        <li>
          <StepShell numeral="02" step="2" flip label="Make the outline yours">
            <h3
              id="walk-step-2-title"
              className="text-[1.75rem] leading-[1.2] font-medium tracking-[-0.026em] text-balance max-sm:text-2xl"
            >
              An Outline you approve.
            </h3>
            <ol key={example.topic} className="mt-5 list-none">
              {example.modules.map((module, index) => (
                <li
                  className="animate-[course-assemble_480ms_var(--ease)_both] border-t border-hair py-2.5"
                  key={module.title}
                  style={{ animationDelay: `${index * 65}ms` }}
                >
                  <h4 className="text-[0.9375rem] font-semibold tracking-[-0.011em]">
                    {module.title}
                  </h4>
                  <p className="mt-1 text-[0.8125rem] leading-[1.6] text-fg-3">
                    {module.lessons.join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-4 flex items-baseline gap-2 text-[0.8125rem] leading-[1.6] text-fg-2 [&>span]:flex-none [&>span]:translate-y-px">
              <LiveMark />
              You approve the outline before anything is written.
            </p>
            <p className="mt-4 max-w-[36rem] text-[0.8125rem] leading-[1.55] text-fg-3">
              Review the Modules and Lessons first. Edit the Outline yourself or ask the Tailor to
              propose changes. Nothing starts until you approve.
            </p>
          </StepShell>
        </li>

        <li>
          <StepShell numeral="03" step="3" label="Learn in every lesson">
            <ExerciseReveal key={example.topic} className="min-w-0">
              <h3
                id="walk-step-3-title"
                className="text-[1.75rem] leading-[1.2] font-medium tracking-[-0.026em] text-balance max-sm:text-2xl"
              >
                {example.exercise}
              </h3>
              <p className="mt-2.5 text-sm leading-[1.7] text-fg-2">{example.task}</p>
            </ExerciseReveal>
            <p className="mt-6 max-w-[36rem] text-[0.9375rem] leading-[1.66] text-fg-2">
              Each Lesson holds an explanation, a worked example, recall and self-explanation
              prompts, and one Exercise. Mark it done to complete the Lesson.
            </p>
          </StepShell>
        </li>

        <li>
          <StepShell numeral="04" step="4" flip label="Ask and adjust">
            <h3
              id="walk-step-4-title"
              className="text-[1.75rem] leading-[1.2] font-medium tracking-[-0.026em] text-balance max-sm:text-2xl"
            >
              Help while you learn.
            </h3>
            <div className="mt-5 border-t border-hair py-4">
              <h4 className="text-[0.9375rem] font-semibold tracking-[-0.011em]">
                A Tutor for your questions
              </h4>
              <p className="mt-1 max-w-[36rem] text-[0.8125rem] leading-[1.6] text-fg-2">
                Ask about the open Lesson or an earlier idea. The Tutor reads your Course and can
                search the web. It never changes your Course.
              </p>
            </div>
            <div className="border-t border-hair py-4">
              <h4 className="text-[0.9375rem] font-semibold tracking-[-0.011em]">
                A Tailor for changes
              </h4>
              <p className="mt-1 max-w-[36rem] text-[0.8125rem] leading-[1.6] text-fg-2">
                Ask for another example or a new sequence. The Tailor proposes a Change plan you
                accept or discard. Your Course stays readable while a revision is prepared.
              </p>
            </div>
            <p className="border-t border-hair pt-4 text-[0.8125rem] leading-[1.6] text-fg-2">
              Leave Grounding on to build from current Sources. Lessons and Tutor answers link back
              to them.
            </p>
          </StepShell>
        </li>

        <li>
          <StepShell numeral="05" step="5" label="Before you start">
            <h3
              id="walk-step-5-title"
              className="text-[1.75rem] leading-[1.2] font-medium tracking-[-0.026em] text-balance max-sm:text-2xl"
            >
              Begin when ready.
            </h3>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="text-[0.9375rem] font-semibold tracking-[-0.011em]">
                  Choose how far to go
                </h4>
                <p className="mt-1 text-[0.8125rem] leading-[1.6] text-fg-2">
                  Set the Depth to reach your Goal, gain working knowledge, or work toward mastery.
                </p>
              </div>
              <div>
                <h4 className="text-[0.9375rem] font-semibold tracking-[-0.011em]">
                  Choose your Course Language
                </h4>
                <p className="mt-1 text-[0.8125rem] leading-[1.6] text-fg-2">
                  English, Spanish, French, German, or Portuguese. Everything in the Course uses it,
                  and it stays fixed.
                </p>
              </div>
            </div>
            <p className="mt-6 max-w-[36rem] text-[0.8125rem] leading-[1.55] text-fg-3">
              Course generation can take several minutes. You can follow its progress or return
              later.
            </p>
          </StepShell>
        </li>
      </ol>
    </section>
  );
}
