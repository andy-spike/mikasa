"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { field } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { depths, library } from "@/lib/demo-library";

/* The demo Course this form generates. The fields start on its values so the
   click-through lands on an Outline that matches what the form says — no
   generation runs in this build. Clear them to see the empty form. */
const seed = library[1];

export default function NewCoursePage() {
  const router = useRouter();
  const [topic, setTopic] = useState(seed.topic);
  const [goal, setGoal] = useState(seed.goal);
  const [depth, setDepth] = useState<string>("reach");
  const [background, setBackground] = useState(seed.background);
  const [grounding, setGrounding] = useState(true);
  const [generating, setGenerating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const ready = topic.trim().length > 0 && goal.trim().length > 0;

  function generate() {
    setGenerating(true);
    timer.current = setTimeout(() => router.push(`/courses/${seed.id}/outline`), 1400);
  }

  return (
    <AppShell section="New Course">
      <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8">
        {generating ? (
          <section aria-live="polite">
            <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
              {topic}
            </h1>
            <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
              Drafting the Modules and the Lesson titles.
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
          </section>
        ) : (
          <>
            <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
              New Course
            </h1>
            <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
              Mikasa drafts the Outline from these answers and stops there. You
              shape it before a Lesson is written.
            </p>

            <form
              className="mt-10"
              onSubmit={(e) => {
                e.preventDefault();
                if (ready) generate();
              }}
            >
              <div className="border-t border-hair py-6">
                <label htmlFor="nc-topic" className="label block text-fg-3">
                  Topic
                </label>
                <input
                  id="nc-topic"
                  required
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="the Vercel AI SDK"
                  className={`${field} mt-3`}
                />
              </div>

              <div className="border-t border-hair py-6">
                <label htmlFor="nc-goal" className="label block text-fg-3">
                  Goal
                </label>
                <p className="mt-1.5 text-[0.75rem] leading-[1.5] text-fg-3">
                  Decides where the Course stops, and what the last Exercise asks for.
                </p>
                <Textarea
                  id="nc-goal"
                  required
                  rows={2}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="build my own AI chat app"
                  className="mt-3"
                />
              </div>

              {/* Not a fieldset: a legend cuts the hairline it sits on, and the
                  hairline is the only thing separating these groups. */}
              <div className="border-t border-hair py-6">
                <p id="depth-label" className="label text-fg-3">
                  Depth
                </p>
                <RadioGroup
                  aria-labelledby="depth-label"
                  value={depth}
                  onValueChange={(v) => setDepth(v as string)}
                  className="mt-3"
                >
                  {depths.map((d) => (
                    <RadioGroupItem key={d.id} value={d.id}>
                      <span
                        className={cn(
                          "block text-[0.8125rem] leading-snug",
                          depth === d.id ? "font-medium text-fg" : "text-fg-2",
                        )}
                      >
                        {d.title}
                      </span>
                      <span className="mt-1 block text-[0.75rem] leading-[1.5] text-fg-3">
                        {d.detail}
                      </span>
                    </RadioGroupItem>
                  ))}
                </RadioGroup>
              </div>

              <div className="border-t border-hair py-6">
                <label htmlFor="nc-background" className="label block text-fg-3">
                  Background <span className="font-normal text-fg-dim">optional</span>
                </label>
                <p className="mt-1.5 text-[0.75rem] leading-[1.5] text-fg-3">
                  The Outline skips fundamentals you name here.
                </p>
                <Textarea
                  id="nc-background"
                  rows={3}
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="I write basic SELECTs and JOINs…"
                  className="mt-3"
                />
              </div>

              <div className="flex flex-wrap items-start justify-between gap-4 border-t border-b border-hair py-6">
                <div className="min-w-0">
                  <p className="label text-fg-3">Grounding</p>
                  <p className="mt-1.5 max-w-[24rem] text-[0.75rem] leading-[1.5] text-fg-3">
                    Consult live web search while generating. Fixed once the
                    Course is created.
                  </p>
                </div>
                <ToggleGroup
                  multiple={false}
                  value={[grounding ? "on" : "off"]}
                  onValueChange={(v) => setGrounding(v[0] !== "off")}
                  aria-label="Grounding"
                >
                  <ToggleGroupItem value="on">On</ToggleGroupItem>
                  <ToggleGroupItem value="off">Off</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Button type="submit" disabled={!ready}>
                  Generate the Outline
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setTopic("");
                    setGoal("");
                    setBackground("");
                  }}
                >
                  Clear
                </Button>
                <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
                  Cancel
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
