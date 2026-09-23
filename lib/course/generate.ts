import type { LanguageModel } from "ai";
import { nanoid } from "nanoid";
import { generationProviderOptions } from "@/lib/model";
import {
  generatedLessonContentSchema,
  lessonContextSummarySchema,
  parseLessonContent,
  type ContentBlock,
  type LessonContent,
} from "./content";
import type { CourseSpecification, OutlineData } from "./types";
import { contractWriteBlock, finalExerciseLines, languageName, sourceLine } from "./prompt-blocks";
import { GenerationError } from "./specification";
import { generateStructuredStage } from "./structured-generation";
import { regenerateLessonContextSummary } from "./lesson-context";

export { GenerationError } from "./specification";

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
    priorLessons: { title: string; contextSummary: string }[];
    previousLesson?: LessonContent;
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
  const skillById = new Map(input.spec.learningGraph.map((n) => [n.id, n.skill]));
  const assumedSkills = alignment.prerequisiteNodes
    .map((id) => skillById.get(id))
    .filter((s): s is string => Boolean(s));
  const adjustment = input.spec.adjustments?.find((a) => a.lessonId === input.lesson.id);
  const relevantSources =
    alignment.sourceRefs.length > 0
      ? input.sources.filter((s) => alignment.sourceRefs.includes(s.ref))
      : input.sources;

  const { output } = await generateStructuredStage({
    stage: "lesson-generation",
    model,
    providerOptions: generationProviderOptions(),
    schema: generatedLessonContentSchema,
    prompt: [
      "You write one Lesson of a Mikasa course. One job: write THIS lesson as",
      "part of one coherent course, not a standalone explainer.",
      "Precedence when sources disagree, in order: 1) the spec alignment for",
      "this Lesson. 2) the example contract verbatim. 3) the prior Lessons'",
      "summaries and the previous Lesson. 4) the Sources. The spec wins over prior Lessons.",
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
      "Private context summaries for every earlier Lesson, in reading order.",
      "Continue from them: keep the names, rules, and scaffolding they established",
      "(shared styles, guards, classes, the running example) and extend them —",
      "never introduce them again as if new:",
      ...(input.priorLessons.length
        ? input.priorLessons.map((l) => `- ${l.title}: ${l.contextSummary}`)
        : ["- (this is the first)"]),
      "",
      "The complete immediately previous Lesson, including its explanation,",
      "worked example, prompts, Exercise, and bridge:",
      input.previousLesson ? JSON.stringify(input.previousLesson) : "(this is the first Lesson)",
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
      "- contextSummary: private context for later Lessons, at most 80 words",
      "  in the Course Language. Record exact shared example changes, names,",
      "  decisions, and promises. Copy technical identifiers unchanged. No teaching recap.",
      "",
      "Return JSON only.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (!output) throw new GenerationError(`No content came back for "${input.lesson.title}".`);

  const checkedSummary = lessonContextSummarySchema.safeParse(output.contextSummary);
  const contextSummary = checkedSummary.success
    ? checkedSummary.data
    : await regenerateLessonContextSummary(model, input.course.language, {
        lessonId: input.lesson.id,
        title: input.lesson.title,
        body: output.body,
        workedExample: output.workedExample,
        recallPrompt: output.recallPrompt,
        selfExplanationPrompt: output.selfExplanationPrompt,
        exercise: output.exercise,
        bridge: output.bridge,
      });
  const content = parseLessonContent(input.lesson.id, input.lesson.title, {
    ...output,
    contextSummary,
  });
  assertKnownSourceRefs(content, new Set(input.sources.map((source) => source.ref)));
  return content;
}

type BlockWithRefs = ContentBlock & { sourceRefs?: string[] };

export function assertKnownSourceRefs(content: LessonContent, known: Set<string>): void {
  for (const block of [...content.body, ...content.workedExample]) {
    const refs = (block as BlockWithRefs).sourceRefs;
    const unknown = refs?.find((ref) => !known.has(ref));
    if (unknown) {
      throw new GenerationError(
        `Lesson "${content.title}" cites Source "${unknown}", which the Course does not have.`,
      );
    }
  }
}

export function candidateIsComplete(outline: OutlineData, writtenLessonIds: Set<string>): boolean {
  return outline.modules.every((m) => m.lessons.every((l) => writtenLessonIds.has(l.id)));
}

// Replay-safe ordering helpers are gone: generation writes one Lesson at a
// time in reading order (ADR 0009), so there is nothing to schedule.
