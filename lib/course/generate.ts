import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { nanoid } from "nanoid";
import { generationProviderOptions } from "@/lib/model";
import {
  lessonContentSchema,
  parseLessonContent,
  type ContentBlock,
  type LessonContent,
} from "./content";
import type { CourseSpecification, OutlineData, OutlineLesson } from "./types";
import { findCyclePath, introducedAtMap, outlinePosition } from "./spec-graph";
import {
  contractWriteBlock,
  finalExerciseLines,
  languageName,
  sourceLine,
} from "./prompt-blocks";

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

// Reading order is the Outline order. The specification must already be
// consistent with it; this function validates and returns that order.
// It never reorders the approved Outline.
export function generationOrder(spec: CourseSpecification, outline: OutlineData): OutlineLesson[] {
  const { lessons, position } = outlinePosition(outline);

  const seenAlignment = new Set<string>();
  for (const a of spec.alignment) {
    if (seenAlignment.has(a.lessonId)) {
      throw new GenerationError(
        `The specification has two alignment entries for Lesson "${a.lessonId}". Keep one.`,
      );
    }
    seenAlignment.add(a.lessonId);
    if (!position.has(a.lessonId)) {
      throw new GenerationError(
        `The specification aligns Lesson "${a.lessonId}", which the Outline does not have.`,
      );
    }
  }
  const missingAlignment = lessons.filter((l) => !seenAlignment.has(l.id));
  if (missingAlignment.length > 0) {
    throw new GenerationError(
      `The specification skipped ${missingAlignment.length} Lesson(s): ${missingAlignment.map((l) => l.title).join(", ")}.`,
    );
  }

  const nodeIds = new Set<string>();
  for (const node of spec.learningGraph) {
    if (nodeIds.has(node.id)) {
      throw new GenerationError(
        `The specification introduces skill "${node.id}" twice. Give every graph node a unique id.`,
      );
    }
    nodeIds.add(node.id);
    if (!position.has(node.lessonId)) {
      throw new GenerationError(
        `The specification's node "${node.id}" points at Lesson "${node.lessonId}", which the Outline does not have.`,
      );
    }
  }
  for (const node of spec.learningGraph) {
    for (const required of node.requires) {
      if (!nodeIds.has(required)) {
        throw new GenerationError(
          `Node "${node.id}" requires "${required}", which no node introduces.`,
        );
      }
    }
  }
  for (const a of spec.alignment) {
    for (const p of a.prerequisiteNodes) {
      if (!nodeIds.has(p)) {
        throw new GenerationError(
          `Lesson "${a.lessonId}" assumes skill "${p}", which no graph node introduces.`,
        );
      }
    }
  }

  // Cycle check over graph nodes.
  const cycle = findCyclePath(spec.learningGraph);
  if (cycle) {
    throw new GenerationError(
      "The specification's dependency graph has a cycle; no Lesson order satisfies it.",
    );
  }

  // Reading-order consistency: a prerequisite cannot be introduced later.
  // Same-Lesson edges are allowed.
  const introducedAt = introducedAtMap(spec.learningGraph, position);
  for (const n of spec.learningGraph) {
    const at = position.get(n.lessonId)!;
    for (const r of n.requires) {
      if (introducedAt.get(r)! > at) {
        throw new GenerationError(
          `Node "${n.id}" in Lesson "${n.lessonId}" requires "${r}", which is only introduced in a later Lesson.`,
        );
      }
    }
  }
  for (const a of spec.alignment) {
    const at = position.get(a.lessonId)!;
    for (const p of a.prerequisiteNodes) {
      const providerAt = introducedAt.get(p);
      if (providerAt !== undefined && providerAt > at) {
        throw new GenerationError(
          `Lesson "${a.lessonId}" assumes skill "${p}", which is only introduced in a later Lesson.`,
        );
      }
    }
  }

  return lessons;
}

export const LESSON_SOURCE_LIMIT = 2;

export function newLessonSourceRef(): string {
  return `les-${nanoid(10)}`;
}

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
    priorLessons: { title: string; summary: string; excerpt?: string }[];
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
  const relevantSources =
    alignment.sourceRefs.length > 0
      ? input.sources.filter((s) => alignment.sourceRefs.includes(s.ref))
      : input.sources;

  const { output } = await generateText({
    model,
    providerOptions: generationProviderOptions(),
    output: Output.object({ schema: lessonContentSchema }),
    prompt: [
      "You write one Lesson of a Mikasa course. One job: write THIS lesson as",
      "part of one coherent course, not a standalone explainer.",
      "Precedence when sources disagree, in order: 1) the spec alignment for",
      "this Lesson. 2) the example contract verbatim. 3) the prior Lessons'",
      "prose. 4) the Sources. The spec wins over prior prose.",
      "Accuracy: only state facts you can support from the spec, the prior",
      "Lessons, or the Sources below. Do not invent versions, APIs, or",
      "behavior. If a fact is uncertain, omit it or state the limit — never",
      "guess. When the Lesson shows code, keep it consistent with the Sources",
      "and the shared example; do not invent APIs the Sources do not show.",
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
      input.spec.throughline.exampleContract
        ? contractWriteBlock(input.spec.throughline.exampleContract)
        : "",
      alignment.exampleStart
        ? `Shared example before this Lesson: ${alignment.exampleStart}`
        : "Shared example before this Lesson: none yet (do not invent a prior state).",
      alignment.exampleEnd
        ? `Shared example after this Lesson: ${alignment.exampleEnd}`
        : "Shared example after this Lesson: unchanged (leave it as it was).",
      alignment.sourceRefs.length
        ? `Stored Sources this Lesson leans on: ${alignment.sourceRefs.join(", ")}`
        : "",
      "",
      ...finalExerciseLines(input.spec),
      "",
      "The Lessons before this one, as they currently stand. This Lesson continues",
      "from them: keep the names, rules, and scaffolding they already established",
      "(shared styles, guards, classes, the running example) and extend them —",
      "never introduce them again as if new:",
      ...(input.priorLessons.length
        ? input.priorLessons.map((l) =>
            [`- ${l.title} — ${l.summary}`, ...(l.excerpt ? [l.excerpt] : [])].join("\n"),
          )
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
      ...(relevantSources.length
        ? relevantSources.map((s) => sourceLine(s))
        : ["- (none: make no factual citation claims)"]),
      "",
      "Produce, as JSON:",
      "- body: 3-7 blocks of explanatory prose (kind 'p'; `code` and **bold**",
      "  inline; add sourceRefs on a 'p' block when its claim leans on a Source,",
      "  but plain teaching without a Source needs no refs).",
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

export function candidateIsComplete(outline: OutlineData, writtenLessonIds: Set<string>): boolean {
  const planned = outline.modules.flatMap((m) => m.lessons.map((l) => l.id));
  return planned.every((id) => writtenLessonIds.has(id));
}

// Replay-safe ordering helpers are gone: generation writes one Lesson at a
// time in reading order (ADR 0009), so there is nothing to schedule.
