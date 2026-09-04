import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { designProviderOptions } from "@/lib/model";
import { parseLessonContent, type ContentBlock, type LessonContent } from "./content";
import type { CourseSpecification, OutlineData, OutlineLesson } from "./types";

export type PromptSource = {
  ref: string;
  title: string;
  url: string;
  excerpt: string;
};

export type LessonSourceSearcher = (
  query: string,
  limit: number,
) => Promise<{ title: string; url: string; content: string }[]>;

export class GenerationError extends Error {
  name = "GenerationError";
}

// Ties keep Outline order; a cycle or missing node fails loudly rather than generating on nothing.
export function generationOrder(spec: CourseSpecification, outline: OutlineData): OutlineLesson[] {
  const lessons = outline.modules.flatMap((m) => m.lessons);
  const position = new Map(lessons.map((l, i) => [l.id, i]));

  const introducedBy = new Map<string, string>();
  for (const node of spec.learningGraph) {
    if (!position.has(node.lessonId)) {
      throw new GenerationError(
        `The specification's node "${node.id}" points at Lesson "${node.lessonId}", which the Outline does not have.`,
      );
    }
    introducedBy.set(node.id, node.lessonId);
  }

  const dependsOn = new Map<string, Set<string>>(lessons.map((l) => [l.id, new Set<string>()]));
  for (const node of spec.learningGraph) {
    const dependentLesson = node.lessonId;
    for (const required of node.requires) {
      const providerLesson = introducedBy.get(required);
      if (!providerLesson) {
        throw new GenerationError(
          `Node "${node.id}" requires "${required}", which no node introduces.`,
        );
      }
      if (providerLesson !== dependentLesson) {
        dependsOn.get(dependentLesson)!.add(providerLesson);
      }
    }
  }

  const remaining = new Map([...dependsOn.entries()].map(([id, deps]) => [id, new Set(deps)]));
  const ordered: OutlineLesson[] = [];
  let progress = true;
  while (ordered.length < lessons.length && progress) {
    progress = false;
    for (const lesson of lessons) {
      if (ordered.some((o) => o.id === lesson.id)) continue;
      const deps = remaining.get(lesson.id)!;
      if (deps.size === 0) {
        ordered.push(lesson);
        progress = true;
        for (const set of remaining.values()) set.delete(lesson.id);
      }
    }
  }
  if (ordered.length < lessons.length) {
    throw new GenerationError(
      "The specification's dependency graph has a cycle; no Lesson order satisfies it.",
    );
  }
  return ordered;
}

const planSchema = z.object({
  needsSource: z.boolean(),
  query: z.string().optional(),
});

export async function planLessonSource(
  model: LanguageModel,
  course: { topic: string; goal: string; grounding: boolean },
  lesson: { title: string; summary: string; performance?: string },
  sharedSources: PromptSource[],
): Promise<{ needsSource: boolean; query?: string }> {
  if (!course.grounding) return { needsSource: false };

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: planSchema }),
    prompt: [
      "A course Lesson is about to be written. Decide whether it needs one web",
      "Source the shared set does not carry — current facts, version numbers,",
      "a concrete reference. Most Lessons need nothing.",
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      `Lesson: ${lesson.title} — ${lesson.summary}`,
      lesson.performance ? `What it teaches: ${lesson.performance}` : "",
      "",
      "Shared sources:",
      ...sharedSources.map((s) => `- ${s.title} (${s.url}): ${s.excerpt.slice(0, 200)}`),
      "",
      "Return needsSource and, only if true, one specific search query.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (!output) return { needsSource: false };
  if (output.needsSource && output.query && output.query.trim()) {
    return { needsSource: true, query: output.query.trim() };
  }
  return { needsSource: false };
}

export const LESSON_SOURCE_LIMIT = 2;

export function newLessonSourceRef(): string {
  return `les-${nanoid(10)}`;
}

const lessonContentSchema = z.object({
  body: z.array(z.unknown()).min(1),
  workedExample: z.array(z.unknown()).min(1),
  recallPrompt: z.string().min(1),
  selfExplanationPrompt: z.string().min(1),
  exercise: z.object({ task: z.string().min(1), check: z.string().min(1) }),
  bridge: z.string().min(1),
});

// Invented source refs are dropped, not passed through.
export async function generateLesson(
  model: LanguageModel,
  input: {
    course: {
      topic: string;
      goal: string;
      background: string;
      language: string;
      depth: string;
    };
    spec: CourseSpecification;
    lesson: { id: string; title: string; summary: string };
    nextLesson: { title: string } | null;
    priorLessons: { title: string; summary: string }[];
    sources: PromptSource[];
  },
): Promise<LessonContent> {
  const alignment = input.spec.alignment.find((a) => a.lessonId === input.lesson.id);
  if (!alignment) {
    throw new GenerationError(
      `The specification has no alignment for Lesson "${input.lesson.title}".`,
    );
  }
  const introducedSkills = input.spec.learningGraph
    .filter((n) => n.lessonId === input.lesson.id)
    .map((n) => n.skill);
  const assumedSkills = alignment.prerequisiteNodes
    .map((id) => input.spec.learningGraph.find((n) => n.id === id)?.skill)
    .filter((s): s is string => Boolean(s));
  const adjustment = input.spec.adjustments?.find((a) => a.lessonId === input.lesson.id);

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: lessonContentSchema }),
    prompt: [
      "You write one Lesson of a Mikasa course. It must read as part of one",
      "coherent course, not a standalone explainer.",
      "",
      `Topic: ${input.course.topic}`,
      `Goal: ${input.course.goal}`,
      input.course.background
        ? `Background (do not re-explain what this names): ${input.course.background}`
        : "Background: none given.",
      `Course language: write every sentence in ${languageName(input.course.language)}.`,
      "",
      "The course's throughline — extend it, do not restart it:",
      JSON.stringify(input.spec.throughline),
      "",
      "Lessons already written (in order):",
      ...(input.priorLessons.length
        ? input.priorLessons.map((l) => `- ${l.title}: ${l.summary}`)
        : ["- (this is the first)"]),
      "",
      `THIS Lesson: ${input.lesson.title} — ${input.lesson.summary}`,
      `It teaches the performance: ${alignment.performance}`,
      introducedSkills.length ? `It introduces the skills: ${introducedSkills.join("; ")}` : "",
      assumedSkills.length ? `It assumes the learner already has: ${assumedSkills.join("; ")}` : "",
      `Module milestone it advances: ${alignment.moduleMilestone}`,
      `Its Exercise must: ${alignment.exerciseContribution}`,
      adjustment?.prose ? `The learner asked, for this Lesson's prose: ${adjustment.prose}` : "",
      adjustment?.exercise
        ? `The learner set this Lesson's Exercise: "${adjustment.exercise.task}", done when: ${adjustment.exercise.check}. Make it the Exercise.`
        : "",
      "",
      "Sources you may cite (cite by ref, only these):",
      ...(input.sources.length
        ? input.sources.map((s) => `- ${s.ref}: ${s.title} (${s.url}) — ${s.excerpt.slice(0, 300)}`)
        : ["- (none: make no factual citation claims)"]),
      "",
      "Produce, as JSON:",
      "- body: 3-7 blocks of explanatory prose (kind 'p'; `code` and **bold**",
      "  inline; cite source refs on 'p' blocks where a claim leans on one).",
      "- workedExample: 1-4 blocks walking one concrete example through the",
      "  throughline's running example.",
      "- recallPrompt: one question the learner answers from memory.",
      "- selfExplanationPrompt: one question about WHY the worked example is",
      "  the way it is.",
      "- exercise: the one task, and 'check': the concrete evidence it is done.",
      `- bridge: one or two sentences into ${input.nextLesson ? `the next Lesson, "${input.nextLesson.title}"` : "the course's final Exercise, which is the Goal made real"}.`,
      "",
      "Return JSON only.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (!output) throw new GenerationError(`No content came back for "${input.lesson.title}".`);

  const knownRefs = new Set(input.sources.map((s) => s.ref));
  const content = parseLessonContent(input.lesson.id, input.lesson.title, output);
  return {
    ...content,
    body: content.body.map(stripUnknownRefs(knownRefs)),
    workedExample: content.workedExample.map(stripUnknownRefs(knownRefs)),
  };
}

type BlockWithRefs = ContentBlock & { sourceRefs?: string[] };

function stripUnknownRefs(known: Set<string>) {
  return (block: unknown): BlockWithRefs => {
    const b = block as BlockWithRefs;
    if (b.sourceRefs) {
      return { ...b, sourceRefs: b.sourceRefs.filter((r) => known.has(r)) };
    }
    return b;
  };
}

function languageName(language: string): string {
  const names: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
  };
  return names[language] ?? "English";
}

export function candidateIsComplete(outline: OutlineData, writtenLessonIds: Set<string>): boolean {
  const planned = outline.modules.flatMap((m) => m.lessons.map((l) => l.id));
  return planned.every((id) => writtenLessonIds.has(id));
}
