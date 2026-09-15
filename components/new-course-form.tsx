"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SkeletonLines } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  courseLanguageLabel,
  depthTargetShape,
  validateCourseInput,
  type CourseInput,
  type CourseInputErrors,
} from "@/lib/course/limits";

const INITIAL_VALUES: CourseInput = {
  topic: "",
  goal: "",
  background: "",
  language: "en",
  depth: "reach",
  grounding: true,
};

const TOUCH_ALL: Partial<Record<keyof CourseInput, boolean>> = {
  topic: true,
  goal: true,
  background: true,
  language: true,
  depth: true,
};

export function NewCourseForm() {
  const router = useRouter();
  const [values, setValues] = useState<CourseInput>(INITIAL_VALUES);
  const [touched, setTouched] = useState<Partial<Record<keyof CourseInput, boolean>>>({});
  const [errors, setErrors] = useState<CourseInputErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  function set<K extends keyof CourseInput>(key: K, value: CourseInput[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    const fresh = validateCourseInput(next);
    if (fresh.ok) {
      setErrors({});
      return;
    }
    const kept: CourseInputErrors = {};
    for (const field of Object.keys(fresh.errors) as (keyof CourseInputErrors)[]) {
      if (field === "form" || touched[field]) kept[field] = fresh.errors[field];
    }
    setErrors(kept);
  }

  function blur(key: keyof CourseInput) {
    setTouched((t) => ({ ...t, [key]: true }));
    const fresh = validateCourseInput(values);
    if (!fresh.ok && fresh.errors[key]) {
      setErrors((e) => ({ ...e, [key]: fresh.errors[key] }));
    }
  }

  const errorsToShow = (key: keyof CourseInput) => (touched[key] ? errors[key] : undefined);

  const invalidProps = (key: keyof CourseInput, id: string) => {
    const error = errorsToShow(key);
    return {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? id : undefined,
    };
  };

  function submit() {
    setTouched(TOUCH_ALL);
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
      setTouched(TOUCH_ALL);
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
          <SkeletonLines />
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
            {...invalidProps("topic", "nc-topic-error")}
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
            {...invalidProps("goal", "nc-goal-error")}
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
            {DEPTH_CHOICES.map((d) => {
              const target = depthTargetShape(d.id);
              return (
                <RadioGroupItem key={d.id} value={d.id}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span
                      className={cn(
                        "text-[0.8125rem] leading-snug",
                        values.depth === d.id ? "font-medium text-fg" : "text-fg-2",
                      )}
                    >
                      {d.title}
                    </span>
                    <span className="tnum shrink-0 text-[0.75rem] leading-[1.5] text-fg-3">
                      {target.lessons} Lessons
                    </span>
                  </span>
                  <span className="mt-1 block text-[0.75rem] leading-[1.5] text-fg-3">
                    {d.detail}
                  </span>
                </RadioGroupItem>
              );
            })}
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
              <SelectValue>{(value) => courseLanguageLabel(value as string)}</SelectValue>
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
            {...invalidProps("background", "nc-background-error")}
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
            <label id="nc-grounding-label" htmlFor="nc-grounding" className="label block text-fg-3">
              Grounding
            </label>
            <p
              id="nc-grounding-note"
              className="mt-1.5 max-w-[24rem] text-[0.75rem] leading-[1.5] text-fg-3"
            >
              Consult live web search while generating. Fixed once the Course is created.
            </p>
          </div>
          <Switch
            id="nc-grounding"
            aria-labelledby="nc-grounding-label"
            aria-describedby="nc-grounding-note"
            checked={values.grounding}
            onCheckedChange={(checked) => set("grounding", checked)}
          />
        </div>

        {errors.form && (
          <p role="alert" className="mt-6 text-[0.8125rem] leading-[1.55] text-fg-2">
            {errors.form}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button type="submit">Generate the Outline</Button>
          <Button
            variant="quiet"
            onClick={() => {
              setValues(INITIAL_VALUES);
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
