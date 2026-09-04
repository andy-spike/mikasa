import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { designProviderOptions } from "@/lib/model";
import { GenerationError } from "./generate";
import type { LessonContent } from "./content";
import type { CourseSpecification, OutlineData } from "./types";

export type FindingKind = "structural" | "factual" | "learning-design" | "code-execution";

export type Finding = {
  kind: FindingKind;
  lessonRef: string | null;
  detail: string;
  correction: string;
};

const findingsSchema = z.object({
  findings: z.array(
    z.object({
      lessonRef: z.string().nullable(),
      detail: z.string().min(1),
      correction: z.string().min(1),
    }),
  ),
});

export const MAX_CORRECTION_ROUNDS = 2;

export type StructuralInput = {
  spec: CourseSpecification;
  outline: OutlineData;
  lessons: LessonContent[];
};

export function structuralFindings(input: StructuralInput): Finding[] {
  const findings: Finding[] = [];
  const planned = input.outline.modules.flatMap((m) => m.lessons);
  const byId = new Map(input.lessons.map((l) => [l.lessonId, l]));
  const knownRefs = new Set(input.spec.evidence.map((e) => e.sourceRef));

  for (const lesson of planned) {
    const content = byId.get(lesson.id);
    if (!content) {
      findings.push({
        kind: "structural",
        lessonRef: lesson.id,
        detail: `Lesson "${lesson.title}" was never written.`,
        correction: `Write the Lesson.`,
      });
      continue;
    }
    if (content.body.length === 0) {
      findings.push({
        kind: "structural",
        lessonRef: lesson.id,
        detail: `Lesson "${lesson.title}" has no explanation.`,
        correction: `Write the explanation.`,
      });
    }
    if (content.workedExample.length === 0) {
      findings.push({
        kind: "structural",
        lessonRef: lesson.id,
        detail: `Lesson "${lesson.title}" has no worked example.`,
        correction: `Write the worked example.`,
      });
    }
    if (!content.recallPrompt.trim()) {
      findings.push({
        kind: "structural",
        lessonRef: lesson.id,
        detail: `Lesson "${lesson.title}" has no recall prompt.`,
        correction: `Write the recall prompt.`,
      });
    }
    if (!content.selfExplanationPrompt.trim()) {
      findings.push({
        kind: "structural",
        lessonRef: lesson.id,
        detail: `Lesson "${lesson.title}" has no self-explanation prompt.`,
        correction: `Write the self-explanation prompt.`,
      });
    }
    if (!content.exercise.task.trim() || !content.exercise.check.trim()) {
      findings.push({
        kind: "structural",
        lessonRef: lesson.id,
        detail: `Lesson "${lesson.title}" has an incomplete Exercise.`,
        correction: `Complete the Exercise.`,
      });
    }
    if (!content.bridge.trim()) {
      findings.push({
        kind: "structural",
        lessonRef: lesson.id,
        detail: `Lesson "${lesson.title}" has no bridge to what comes next.`,
        correction: `Write the bridge.`,
      });
    }

    for (const block of [...content.body, ...content.workedExample]) {
      const refs = (block as { sourceRefs?: string[] }).sourceRefs;
      if (refs) {
        for (const ref of refs) {
          if (!knownRefs.has(ref)) {
            findings.push({
              kind: "structural",
              lessonRef: lesson.id,
              detail: `Lesson "${lesson.title}" cites Source "${ref}", which the Course does not have.`,
              correction: `Remove or replace the citation.`,
            });
          }
        }
      }
    }
  }

  const position = new Map(planned.map((l, i) => [l.id, i]));
  const introducedAt = new Map<string, number>();
  for (const node of input.spec.learningGraph) {
    const at = position.get(node.lessonId);
    if (at === undefined) continue;
    introducedAt.set(node.id, at);
  }
  for (const alignment of input.spec.alignment) {
    const at = position.get(alignment.lessonId);
    if (at === undefined) continue;
    for (const nodeId of alignment.prerequisiteNodes) {
      const introduced = introducedAt.get(nodeId);
      if (introduced !== undefined && introduced > at) {
        const lesson = planned[at];
        findings.push({
          kind: "structural",
          lessonRef: lesson.id,
          detail: `Lesson "${lesson.title}" assumes skill "${nodeId}", which is only introduced in a later Lesson.`,
          correction: `Move the assumption or add what it needs earlier.`,
        });
      }
    }
  }

  return findings;
}

export async function factualFindings(
  model: LanguageModel,
  course: { topic: string; goal: string; language: string },
  spec: CourseSpecification,
  sources: { ref: string; title: string; url: string; excerpt: string }[],
  lessons: LessonContent[],
): Promise<Finding[]> {
  const byId = new Map(spec.alignment.map((a) => [a.lessonId, a.performance]));

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: findingsSchema }),
    prompt: [
      "You review a complete course candidate before it publishes. Your slice:",
      "factual accuracy and code correctness. Report only what a reader could",
      "act on and get hurt by: wrong facts, outdated versions, broken or",
      "inconsistent code, claims the Sources contradict. Do not report style.",
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      "",
      "Sources (with refs):",
      ...(sources.length
        ? sources.map((s) => `- ${s.ref}: ${s.title} (${s.url}) — ${s.excerpt.slice(0, 300)}`)
        : ["- (none)"]),
      "",
      "The complete candidate, Lesson by Lesson:",
      ...lessons.map((l) =>
        [
          `LESSON ${l.lessonId} — "${l.title}" (teaches: ${byId.get(l.lessonId) ?? "?"})`,
          ...l.body.map(renderBlockForReview),
          ...l.workedExample.map(renderBlockForReview),
          `EXERCISE: ${l.exercise.task} | CHECK: ${l.exercise.check}`,
        ].join("\n"),
      ),
      "",
      "Return findings: lessonRef (exact id above, or null for the whole course),",
      "detail (what is wrong), correction (what to change). Empty array if none.",
    ].join("\n"),
  });

  if (!output) throw new GenerationError("The factual review returned nothing.");
  return output.findings.map((f) => ({ ...f, kind: "factual" as const }));
}

export async function designFindings(
  model: LanguageModel,
  course: { topic: string; goal: string; language: string },
  spec: CourseSpecification,
  outline: OutlineData,
  lessons: LessonContent[],
): Promise<Finding[]> {
  const byId = new Map(spec.alignment.map((a) => [a.lessonId, a.performance]));

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: findingsSchema }),
    prompt: [
      "You review a complete course candidate before it publishes. Your slice:",
      "learning design. Report only what would make the course read as",
      "unrelated explainers instead of one course: Lessons that ignore the",
      "throughline, bridges that contradict what the next Lesson actually",
      "teaches, Exercises that do not build toward the final one, assumptions",
      "of skills not yet taught.",
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      `Throughline: ${JSON.stringify(spec.throughline)}`,
      `Final Exercise: ${JSON.stringify(spec.finalExercise)}`,
      "",
      "The candidate, in order:",
      ...outline.modules.flatMap((m) =>
        m.lessons.map((l) => {
          const content = lessons.find((x) => x.lessonId === l.id);
          return `- ${l.id} "${l.title}" (teaches: ${byId.get(l.id) ?? "?"}): ${
            content ? content.body.map(renderBlockForReview).join(" ").slice(0, 600) : "(missing)"
          } | bridge: ${content?.bridge ?? "(none)"}`;
        }),
      ),
      "",
      "Return findings: lessonRef, detail, correction. Empty array if none.",
    ].join("\n"),
  });

  if (!output) throw new GenerationError("The learning-design review returned nothing.");
  return output.findings.map((f) => ({ ...f, kind: "learning-design" as const }));
}

function renderBlockForReview(block: unknown): string {
  const b = block as {
    kind: string;
    text?: string;
    code?: string;
    language?: string;
    title?: string;
  };
  switch (b.kind) {
    case "p":
      return b.text ?? "";
    case "code":
      return `[${b.language ?? "code"}]\n${b.code ?? ""}`;
    case "note":
      return `[note: ${b.title}] ${b.text ?? ""}`;
    case "table":
      return "[table]";
    default:
      return "";
  }
}

const correctionSchema = z.object({
  body: z.array(z.unknown()).min(1),
  workedExample: z.array(z.unknown()).min(1),
  recallPrompt: z.string().min(1),
  selfExplanationPrompt: z.string().min(1),
  exercise: z.object({ task: z.string().min(1), check: z.string().min(1) }),
  bridge: z.string().min(1),
});

export async function correctLesson(
  model: LanguageModel,
  course: { topic: string; goal: string; language: string },
  spec: CourseSpecification,
  lesson: LessonContent,
  findings: Finding[],
  priorLessons: { title: string; summary: string }[],
): Promise<LessonContent> {
  const alignment = spec.alignment.find((a) => a.lessonId === lesson.lessonId);
  const { parseLessonContent } = await import("./content");

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: correctionSchema }),
    prompt: [
      "You correct one Lesson of a Mikasa course after review. Fix exactly what",
      "the findings name; keep everything else as it is, word for word where",
      `possible. Write in ${languageName(course.language)}.`,
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      `Throughline: ${JSON.stringify(spec.throughline)}`,
      alignment ? `This Lesson teaches: ${alignment.performance}` : "",
      "",
      "Lessons around it (do not contradict them):",
      ...priorLessons.map((l) => `- ${l.title}: ${l.summary}`),
      "",
      `The Lesson as it stands:`,
      JSON.stringify(lesson),
      "",
      "The findings to fix:",
      ...findings.map((f) => `- [${f.kind}] ${f.detail} → ${f.correction}`),
      "",
      "Return the full corrected Lesson as JSON (body, workedExample,",
      "recallPrompt, selfExplanationPrompt, exercise {task, check}, bridge).",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (!output) {
    throw new GenerationError(`The correction for "${lesson.title}" returned nothing.`);
  }
  return parseLessonContent(lesson.lessonId, lesson.title, output);
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
