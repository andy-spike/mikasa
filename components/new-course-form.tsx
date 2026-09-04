"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { field } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { createCourseAction } from "@/lib/actions/courses";
import {
  BACKGROUND_MAX_LENGTH,
  COURSE_LANGUAGES,
  DEPTH_CHOICES,
  GOAL_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  validateCourseInput,
  type CourseInput,
  type CourseInputErrors,
} from "@/lib/course/limits";

export function NewCourseForm() {
  const router = useRouter();
  const [values, setValues] = useState<CourseInput>({
    topic: "",
    goal: "",
    background: "",
    language: "en",
    depth: "reach",
    grounding: true,
  });
  const [touched, setTouched] = useState<Partial<Record<keyof CourseInput, boolean>>>({});
  const [errors, setErrors] = useState<CourseInputErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  function set<K extends keyof CourseInput>(key: K, value: CourseInput[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    const fresh = validateCourseInput(next);
    setErrors(() => {
      if (fresh.ok) return {};
      const kept: CourseInputErrors = {};
      for (const field of Object.keys(fresh.errors) as (keyof CourseInputErrors)[]) {
        if (field === "form" || touched[field]) kept[field] = fresh.errors[field];
      }
      return kept;
    });
  }

  function blur(key: keyof CourseInput) {
    setTouched((t) => ({ ...t, [key]: true }));
    const fresh = validateCourseInput(values);
    if (!fresh.ok && fresh.errors[key]) {
      setErrors((e) => ({ ...e, [key]: fresh.errors[key] }));
    }
  }

  const errorsToShow = (key: keyof CourseInput) => (touched[key] && errors[key]) || undefined;

  function submit() {
    setTouched({ topic: true, goal: true, background: true, language: true, depth: true });
    const fresh = validateCourseInput(values);
    if (!fresh.ok) {
      setErrors(fresh.errors);
      return;
    }
    setSubmitting(true);
    startTransition(async () => {
      const result = await createCourseAction(values);
      if (result.ok) {
        router.push(`/courses/${result.courseId}/outline`);
        return;
      }
      setSubmitting(false);
      setTouched({ topic: true, goal: true, background: true, language: true, depth: true });
      setErrors(result.errors);
    });
  }

  if (submitting) {
    return (
      <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8" aria-live="polite">
        <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
          {values.topic.trim() || "New Course"}
        </h1>
        <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
          Starting the design. You can leave this page — the Outline will be waiting here when you
          come back.
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
    <div className="mx-auto w-full max-w-[38rem] px-5 pt-10 pb-24 sm:px-8">
      <h1 className="text-[1.875rem] leading-[1.16] font-semibold tracking-[-0.026em] text-fg">
        New Course
      </h1>
      <p className="mt-3 max-w-(--measure) text-[0.9375rem] leading-[1.66] text-fg-2">
        Mikasa drafts the Outline from these answers and stops there. You shape it before a Lesson
        is written.
      </p>

      <form
        className="mt-10"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div className="border-t border-hair py-6">
          <label htmlFor="nc-topic" className="label block text-fg-3">
            Topic
          </label>
          <input
            id="nc-topic"
            value={values.topic}
            onChange={(e) => set("topic", e.target.value)}
            onBlur={() => blur("topic")}
            aria-invalid={errorsToShow("topic") ? true : undefined}
            aria-describedby={errorsToShow("topic") ? "nc-topic-error" : undefined}
            placeholder="the Vercel AI SDK"
            className={`${field} mt-3`}
          />
          <FieldNote
            id="nc-topic-error"
            error={errorsToShow("topic")}
            count={values.topic.trim().length}
            max={TOPIC_MAX_LENGTH}
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
            rows={2}
            value={values.goal}
            onChange={(e) => set("goal", e.target.value)}
            onBlur={() => blur("goal")}
            aria-invalid={errorsToShow("goal") ? true : undefined}
            aria-describedby={errorsToShow("goal") ? "nc-goal-error" : undefined}
            placeholder="build my own AI chat app"
            className="mt-3"
          />
          <FieldNote
            id="nc-goal-error"
            error={errorsToShow("goal")}
            count={values.goal.trim().length}
            max={GOAL_MAX_LENGTH}
          />
        </div>

        <div className="border-t border-hair py-6">
          <p id="depth-label" className="label text-fg-3">
            Depth
          </p>
          <RadioGroup
            aria-labelledby="depth-label"
            value={values.depth}
            onValueChange={(v) => set("depth", v as CourseInput["depth"])}
            className="mt-3"
          >
            {DEPTH_CHOICES.map((d) => (
              <RadioGroupItem key={d.id} value={d.id}>
                <span
                  className={cn(
                    "block text-[0.8125rem] leading-snug",
                    values.depth === d.id ? "font-medium text-fg" : "text-fg-2",
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
          <label htmlFor="nc-language" className="label block text-fg-3">
            Course Language
          </label>
          <p className="mt-1.5 text-[0.75rem] leading-[1.5] text-fg-3">
            The language of the Outline, the Lessons and every conversation. Fixed once the Course
            is created.
          </p>
          <Select
            value={values.language}
            onValueChange={(v) => set("language", v as CourseInput["language"])}
          >
            <SelectTrigger
              id="nc-language"
              aria-label="Course Language"
              className="mt-3 w-fit min-w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COURSE_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            value={values.background}
            onChange={(e) => set("background", e.target.value)}
            onBlur={() => blur("background")}
            aria-invalid={errorsToShow("background") ? true : undefined}
            aria-describedby={errorsToShow("background") ? "nc-background-error" : undefined}
            placeholder="I write basic SELECTs and JOINs…"
            className="mt-3"
          />
          <FieldNote
            id="nc-background-error"
            error={errorsToShow("background")}
            count={values.background.trim().length}
            max={BACKGROUND_MAX_LENGTH}
          />
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-b border-hair py-6">
          <div className="min-w-0">
            <p className="label text-fg-3">Grounding</p>
            <p className="mt-1.5 max-w-[24rem] text-[0.75rem] leading-[1.5] text-fg-3">
              Consult live web search while generating. Fixed once the Course is created.
            </p>
          </div>
          <ToggleGroup
            multiple={false}
            value={[values.grounding ? "on" : "off"]}
            onValueChange={(v) => set("grounding", v[0] !== "off")}
            aria-label="Grounding"
          >
            <ToggleGroupItem value="on">On</ToggleGroupItem>
            <ToggleGroupItem value="off">Off</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {errors.form ? (
          <p role="alert" className="mt-6 text-[0.8125rem] leading-[1.55] text-fg-2">
            {errors.form}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button type="submit">Generate the Outline</Button>
          <Button
            variant="quiet"
            onClick={() => {
              setValues({
                topic: "",
                goal: "",
                background: "",
                language: "en",
                depth: "reach",
                grounding: true,
              });
              setTouched({});
              setErrors({});
            }}
          >
            Clear
          </Button>
          <Button variant="quiet" render={<Link href="/courses" />} className="ml-auto">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function FieldNote({
  id,
  error,
  count,
  max,
}: {
  id: string;
  error?: string;
  count: number;
  max: number;
}) {
  if (error) {
    return (
      <p id={id} className="mt-2 text-[0.75rem] leading-[1.5] text-fg-2">
        {error}
      </p>
    );
  }
  if (count <= max * 0.7) return null;
  return (
    <p id={id} className="tnum mt-2 text-[0.75rem] leading-[1.5] text-fg-3">
      {count}/{max}
    </p>
  );
}
