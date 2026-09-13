"use client";

import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseReveal } from "@/components/landing-motion";
import { Reveal } from "@/components/reveal";
import { LiveMark } from "@/components/workspace/marks";

export const courseExamples = [
  {
    topic: "Photography",
    goal: "Take portraits using natural light.",
    background:
      "I use my camera on automatic. I want to understand light and choose my own settings.",
    modules: [
      {
        title: "Know your camera",
        lessons: ["Aperture and depth of field", "Shutter speed and ISO"],
      },
      {
        title: "Learn to see light",
        lessons: ["Window light and open shade", "Position your subject"],
      },
      {
        title: "Make a portrait",
        lessons: ["Compose and guide a portrait", "Shoot and review a portrait series"],
      },
    ],
    exercise: "One window. Three portraits.",
    task: "Photograph the same person in three positions around one window, then choose the softest portrait and say why.",
  },
  {
    topic: "Jazz harmony",
    goal: "Play a jazz standard with chord voicings I understand.",
    background:
      "I play piano and read music, but seventh chords and jazz chord symbols are new to me.",
    modules: [
      {
        title: "Hear the harmony",
        lessons: ["Build seventh chords", "Hear tension and resolution"],
      },
      {
        title: "Connect the chords",
        lessons: ["The ii–V–I progression", "Guide tones and voice leading"],
      },
      {
        title: "Play a standard",
        lessons: ["Map the harmony of a lead sheet", "Arrange and record a chorus"],
      },
    ],
    exercise: "Three chords. The shortest path.",
    task: "Play Dm7, G7 and Cmaj7 with minimal right-hand movement, then name the notes that stay or move by a semitone.",
  },
  {
    topic: "Databases",
    goal: "Design a database for a small online shop.",
    background:
      "I can write basic SQL queries. I have never designed a schema or used a transaction.",
    modules: [
      { title: "Model the shop", lessons: ["Entities and relationships", "Keys and constraints"] },
      {
        title: "Make the data reliable",
        lessons: ["Normalize orders and products", "Transactions and stock updates"],
      },
      {
        title: "Build and query it",
        lessons: ["Indexes for everyday queries", "Test a complete checkout"],
      },
    ],
    exercise: "An order that stays correct.",
    task: "Keep a two-item order total correct when prices change, with constraints, an insert and a totals query.",
  },
];

export function LandingCourseDemo({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (index: number) => void;
}) {
  const example = courseExamples[selected];
  return (
    <section id="example" className="scroll-mt-[5.5rem]" aria-labelledby="example-title">
      <div className="flex items-end justify-between gap-8 border-t border-hair py-10 max-sm:block max-sm:py-8">
        <h2
          id="example-title"
          className="text-[1.875rem] leading-[1.16] font-medium tracking-[-0.026em]"
        >
          A different curiosity.
          <br />A course of your own.
        </h2>
        <p className="max-w-[19rem] text-[0.9375rem] leading-[1.66] text-fg-3 max-sm:mt-4">
          Choose a subject. See how a specific goal becomes a path you can follow.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-hair max-sm:block">
        <div className="flex max-sm:w-full" role="group" aria-label="Example course subject">
          {courseExamples.map((item, index) => (
            <Button
              key={item.topic}
              variant="bare"
              aria-pressed={selected === index}
              aria-controls="course-preview"
              onClick={() => onSelect(index)}
              className="flex min-h-14 cursor-pointer items-center justify-between gap-8 px-5 py-3.5 text-sm text-fg-3 transition-colors hover:bg-panel hover:text-fg aria-pressed:bg-panel aria-pressed:text-fg aria-pressed:shadow-[inset_0_-2px_var(--fg)] max-sm:flex-1 max-sm:justify-center max-sm:gap-[0.4rem] max-sm:px-2 max-sm:py-3 max-sm:text-xs [&_svg]:transition-transform [&_svg]:duration-[240ms] [&_svg]:ease-expo aria-pressed:[&_svg]:rotate-45"
            >
              {item.topic}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Button>
          ))}
        </div>
        <span className="text-xs text-fg-3 max-sm:block max-sm:py-3">Illustrative courses</span>
      </div>
      <div id="course-preview" aria-live="polite" aria-atomic="true">
        <div key={example.topic} className="border-y border-hair bg-panel">
          <ol className="m-0 list-none p-0">
            <li className="demo-stage relative grid grid-cols-[2.5rem_1fr] items-baseline gap-3 p-8 max-[1000px]:p-7 max-sm:p-6">
              <span
                className="tnum relative z-[1] w-7 bg-panel text-center font-mono text-xs text-fg-3"
                aria-hidden="true"
              >
                01
              </span>
              <Reveal className="min-w-0 max-w-xl">
                <p className="label flex items-baseline text-fg-3">Start with your goal</p>
                <h3 className="mt-3 text-[1.75rem] leading-[1.2] font-medium tracking-[-0.026em] text-balance max-sm:text-2xl">
                  {example.goal}
                </h3>
                <p className="mt-2.5 text-sm leading-[1.66] text-fg-2">{example.background}</p>
                <p className="tnum mt-2.5 text-xs text-fg-3">Depth · Reach the Goal</p>
              </Reveal>
            </li>
            <li className="demo-stage relative grid grid-cols-[2.5rem_1fr] items-baseline gap-3 p-8 max-[1000px]:p-7 max-sm:p-6">
              <span
                className="tnum relative z-[1] w-7 bg-panel text-center font-mono text-xs text-fg-3"
                aria-hidden="true"
              >
                02
              </span>
              <Reveal className="min-w-0 max-w-xl">
                <p className="label flex items-baseline text-fg-3">Make the outline yours</p>
                <ol className="mt-5 list-none">
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
              </Reveal>
            </li>
            <li className="demo-stage relative grid grid-cols-[2.5rem_1fr] items-baseline gap-3 p-8 max-[1000px]:p-7 max-sm:p-6">
              <span
                className="tnum relative z-[1] w-7 bg-panel text-center font-mono text-xs text-fg-3"
                aria-hidden="true"
              >
                03
              </span>
              <ExerciseReveal className="min-w-0 max-w-xl">
                <p className="label flex items-baseline text-fg-3">Learn in every lesson</p>
                <h3 className="mt-3 text-[1.75rem] leading-[1.2] font-medium tracking-[-0.026em] text-balance max-sm:text-2xl">
                  {example.exercise}
                </h3>
                <p className="mt-2.5 text-sm leading-[1.7] text-fg-2">{example.task}</p>
              </ExerciseReveal>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
