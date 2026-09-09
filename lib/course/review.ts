import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { designProviderOptions, generationProviderOptions } from "@/lib/model";
import { GenerationError } from "./generate";
import { lessonContentSchema, type LessonContent } from "./content";
import {
  contractCorrectBlock,
  contractReviewBlock,
  finalExerciseLines,
  languageName,
  sourceLine,
} from "./prompt-blocks";
import { introducedAtMap, outlinePosition } from "./spec-graph";
import type { CourseSpecification, OutlineData } from "./types";

export { CORRECTION_SOURCE_QUERY_CAP, dedupeCorrectionQueries, MAX_CORRECTION_ROUNDS } from "./review-policy";

export type FindingKind = "structural" | "factual";

export type Finding = {
  kind: FindingKind;
  lessonRef: string | null;
  detail: string;
  correction: string;
  sourceQuery?: string;
};

// The combined model review returns one row per critical factual issue with a
// nonempty lessonRefs array; the workflow expands multi-Lesson rows into the
// persisted per-Lesson shape so the table schema does not change.
export type CombinedModelFinding = {
  kind: "factual";
  lessonRefs: string[];
  quote: string;
  detail: string;
  correction: string;
  sourceQuery?: string;
};

const combinedFindingsSchema = z.object({
  findings: z
    .array(
      z.object({
        kind: z.enum(["factual"]),
        lessonRefs: z.array(z.string()).min(1),
        quote: z.string().min(1),
        detail: z.string().min(1),
        correction: z.string().min(1),
        sourceQuery: z.string().optional(),
      }),
    )
    .max(3),
});

// Correction policy lives in ./review-policy so workflow files can import it
// without pulling the AI SDK into the workflow bundle.
export type StructuralInput = {
  spec: CourseSpecification;
  outline: OutlineData;
  lessons: LessonContent[];
  storedSources?: { ref: string }[];
};

export function structuralFindings(input: StructuralInput): Finding[] {
  const findings: Finding[] = [];
  const { lessons: planned } = outlinePosition(input.outline);
  const byId = new Map(input.lessons.map((l) => [l.lessonId, l]));
  // Stored Sources are the authority; the specification's original evidence
  // entries alone are not enough. A stored Source absent from evidence passes.
  const knownRefs = new Set<string>([
    ...input.spec.evidence.map((e) => e.sourceRef),
    ...(input.storedSources ?? []).map((s) => s.ref),
  ]);

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

  const { position } = outlinePosition(input.outline);
  const introducedAt = introducedAtMap(input.spec.learningGraph, position);
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

// One model review for critical factual accuracy only. Reviews the whole
// candidate every round; an invalid or empty target list is a review error,
// never a pass. Advisory issues are discarded: return an empty array for
// style, bridge wording, throughline preference, or exercise polish.
export async function combinedFindings(
  model: LanguageModel,
  course: { topic: string; goal: string; language: string },
  spec: CourseSpecification,
  outline: OutlineData,
  sources: { ref: string; title: string; url: string; excerpt: string }[],
  lessons: LessonContent[],
): Promise<Finding[]> {
  const byId = new Map(spec.alignment.map((a) => [a.lessonId, a.performance]));
  const knownIds = new Set(outline.modules.flatMap((m) => m.lessons.map((l) => l.id)));

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: combinedFindingsSchema }),
    prompt: [
      "You review a complete course candidate before it publishes. One job:",
      "report critical factual errors only: wrong facts, outdated versions,",
      "broken code, or claims the Sources contradict. A learner must get hurt",
      "if it ships.",
      "Discard everything advisory: style, bridge wording, throughline taste,",
      "exercise polish. When in doubt, return no finding.",
      "Return at most 3 findings, ordered by harm. Each finding needs the exact",
      "quote from the Lesson, what is wrong with it, and a concrete fix.",
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      spec.throughline.exampleContract
        ? contractReviewBlock(spec.throughline.exampleContract)
        : "",
      "",
      "Sources (with refs):",
      ...(sources.length ? sources.map((s) => sourceLine(s)) : ["- (none)"]),
      "",
      "The complete candidate, Lesson by Lesson, in reading order:",
      ...outline.modules.flatMap((m) =>
        m.lessons.map((l) => {
          const content = lessons.find((x) => x.lessonId === l.id);
          if (!content) return `LESSON ${l.id} — "${l.title}" (missing)`;
          return [
            `LESSON ${l.id} — "${l.title}" (teaches: ${byId.get(l.id) ?? "?"})`,
            ...content.body.map(renderBlockForReview),
            ...content.workedExample.map(renderBlockForReview),
            `RECALL: ${content.recallPrompt} | SELF-EXPLAIN: ${content.selfExplanationPrompt}`,
            `EXERCISE: ${content.exercise.task} | CHECK: ${content.exercise.check}`,
            `BRIDGE: ${content.bridge}`,
          ].join("\n");
        }),
      ),
      "",
      "Return findings: kind must be factual, lessonRefs (nonempty array of exact Lesson ids above;",
      "use several ids when one issue spans Lessons), quote (the exact Lesson text that is wrong), detail (what is wrong with that quote), correction (what to change),",
      "and an optional sourceQuery (one web search that would settle the fact). Empty array if none.",
    ].join("\n"),
  });

  if (!output) throw new GenerationError("The combined review returned nothing.");
  const textById = new Map(
    lessons.map((l) =>
      [
        l.lessonId,
        [...l.body.map(renderBlockForReview), ...l.workedExample.map(renderBlockForReview)].join("\n"),
      ] as const,
    ),
  );
  const expanded: Finding[] = [];
  for (const f of output.findings) {
    if (!f.lessonRefs || f.lessonRefs.length === 0) {
      throw new GenerationError(
        `The review returned a finding with no target Lesson: ${f.detail}. A finding must name at least one Lesson.`,
      );
    }
    for (const ref of f.lessonRefs) {
      if (!knownIds.has(ref)) {
        throw new GenerationError(
          `The review targets Lesson "${ref}", which the candidate does not have: ${f.detail}.`,
        );
      }
      const text = textById.get(ref) ?? "";
      if (!f.quote.trim() || !text.includes(f.quote.trim())) {
        throw new GenerationError(
          `The review quotes text that Lesson "${ref}" does not contain: ${f.quote}. Quote the Lesson exactly.`,
        );
      }
    }
    for (const ref of f.lessonRefs) {
      expanded.push({
        kind: "factual" as const,
        lessonRef: ref,
        detail: `"${f.quote.trim()}" — ${f.detail}`,
        correction: f.correction,
        ...(f.sourceQuery?.trim() ? { sourceQuery: f.sourceQuery.trim() } : {}),
      });
    }
  }
  return expanded;
}

// Corrections must agree with the candidate the review judged, so the
// corrector sees every other Lesson as it currently stands. Generation sees
// the same prose context (ADR 0009): neither writes blind.
export const SIBLING_CONTEXT_MAX_CHARS = 3500;

export function lessonContextExcerpt(lesson: LessonContent): string {
  const parts = [
    ...lesson.body.map(renderBlockForReview),
    ...lesson.workedExample.map(renderBlockForReview),
    `RECALL: ${lesson.recallPrompt} | SELF-EXPLAIN: ${lesson.selfExplanationPrompt}`,
    `EXERCISE: ${lesson.exercise.task} | CHECK: ${lesson.exercise.check}`,
    `BRIDGE: ${lesson.bridge}`,
  ];
  const text = parts.join("\n").trim();
  return text.length > SIBLING_CONTEXT_MAX_CHARS ? text.slice(0, SIBLING_CONTEXT_MAX_CHARS) : text;
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

export async function correctLesson(
  model: LanguageModel,
  course: { topic: string; goal: string; language: string },
  spec: CourseSpecification,
  lesson: LessonContent,
  findings: Finding[],
  priorLessons: { title: string; summary: string; excerpt?: string }[],
  options?: {
    preserveExercise?: boolean;
    sources?: { ref: string; title: string; url: string; excerpt: string }[];
  },
): Promise<LessonContent> {
  const alignment = spec.alignment.find((a) => a.lessonId === lesson.lessonId);
  const { parseLessonContent } = await import("./content");

  const { output } = await generateText({
    model,
    providerOptions: generationProviderOptions(),
    output: Output.object({ schema: lessonContentSchema }),
    prompt: [
      "You correct one Lesson of a Mikasa course after review. One job: fix the",
      "named quotes and nothing else. Fix each quoted passage plus the same exact",
      "string where it repeats inside THIS lesson only. Keep everything else as",
      "it is, word for word. Never add new facts, new Sources, or new claims —",
      `fix from the named Sources only. Write in ${languageName(course.language)}.`,
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      `Throughline: ${JSON.stringify(spec.throughline)}`,
      spec.throughline.exampleContract
        ? contractCorrectBlock(spec.throughline.exampleContract)
        : "",
      ...finalExerciseLines(spec),
      alignment ? `This Lesson teaches: ${alignment.performance}` : "",
      alignment?.exampleStart ? `Shared example before: ${alignment.exampleStart}` : "",
      alignment?.exampleEnd ? `Shared example after: ${alignment.exampleEnd}` : "",
      options?.preserveExercise
        ? "Keep this Lesson's Exercise exactly as it stands; fix only prose, worked example, prompts, and bridge."
        : "",
      ...(options?.sources?.length
        ? [
            "Stored Sources you may cite (only these):",
            ...options.sources.map((s) => `- ${s.ref}: ${s.title} — ${s.excerpt.slice(0, 300)}`),
          ]
        : []),
      "",
      priorLessons.length
        ? [
            "The other Lessons as they currently stand, in reading order. Your corrections must agree",
            "with what they actually say; when a finding names another Lesson, match what is shown here:",
            ...priorLessons.map((l) =>
              [`- ${l.title} — ${l.summary}`, ...(l.excerpt ? [l.excerpt] : [])].join("\n"),
            ),
          ].join("\n")
        : "",
      "",
      `The Lesson as it stands:`,
      JSON.stringify(lesson),
      "",
      "The findings to fix. Each finding names the exact quote to replace;",
      "fix that quote plus the same exact string where it repeats in this",
      "Lesson only. Do not touch other Lessons, do not broaden the fix:",
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
  const corrected = parseLessonContent(lesson.lessonId, lesson.title, output);
  if (options?.preserveExercise) {
    return { ...corrected, exercise: lesson.exercise };
  }
  return corrected;
}
