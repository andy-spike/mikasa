import type { LanguageModel } from "ai";
import { z } from "zod";
import { designProviderOptions, generationProviderOptions } from "@/lib/model";
import { parseLessonContent, type LessonContent } from "./content";
import {
  contractCorrectBlock,
  contractReviewBlock,
  finalExerciseLines,
  languageName,
  sourceLine,
} from "./prompt-blocks";
import { GenerationError, laterPrerequisiteViolations } from "./specification";
import { generateStructuredStage } from "./structured-generation";
import type { CourseSpecification, OutlineData } from "./types";

export {
  CORRECTION_SOURCE_QUERY_CAP,
  dedupeCorrectionQueries,
  MAX_CORRECTION_ROUNDS,
} from "./review-policy";

export type FindingKind = "structural" | "factual" | "summary" | "continuity";

export type Finding = {
  kind: FindingKind;
  lessonRef: string | null;
  quote?: string;
  detail: string;
  correction: string;
  sourceQuery?: string;
  relatedLessonRefs?: string[];
};

// The combined model review returns one row per blocking issue with a
// nonempty lessonRefs array; the workflow expands multi-Lesson rows into the
// persisted per-Lesson shape so the table schema does not change.
export type CombinedModelFinding = {
  kind: "factual" | "summary" | "continuity";
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
        kind: z.enum(["factual", "summary", "continuity"]),
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
  const planned = input.outline.modules.flatMap((module) => module.lessons);
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
      const refs = (block as { sourceRefs?: string[] }).sourceRefs ?? [];
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

  const lessonById = new Map(planned.map((lesson) => [lesson.id, lesson]));
  for (const violation of laterPrerequisiteViolations(input.spec, input.outline)) {
    const lesson = lessonById.get(violation.lessonId)!;
    findings.push({
      kind: "structural",
      lessonRef: lesson.id,
      detail: `Lesson "${lesson.title}" assumes skill "${violation.nodeId}", which is only introduced in a later Lesson.`,
      correction: `Move the assumption or add what it needs earlier.`,
    });
  }

  return findings;
}

// One model review for critical factual accuracy and harmful continuity.
// Reviews the whole
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
  const contentById = new Map(lessons.map((l) => [l.lessonId, l]));

  const { output } = await generateStructuredStage({
    stage: "course-review",
    model,
    providerOptions: designProviderOptions(),
    schema: combinedFindingsSchema,
    prompt: [
      "You review a complete Course candidate before it publishes. Report:",
      "critical factual errors (wrong facts, outdated versions, broken code,",
      "or claims the Sources contradict); conflicts between Lessons that would",
      "mislead a Learner; and private Lesson context summaries that misstate",
      "their Lesson in a way that could mislead later Lessons.",
      "Discard everything advisory: style, bridge wording, throughline taste,",
      "exercise polish. When in doubt, return no finding.",
      "Return at most 3 findings, ordered by harm. Quote the exact bad text",
      "from the Lesson for factual or continuity findings, or from its private",
      "context summary for summary findings. Give a concrete fix.",
      "If a summary could mislead later Lessons, report its summary finding",
      "first. Later Lesson conflicts will be rechecked after it is repaired.",
      "",
      `Topic: ${course.topic}`,
      `Goal: ${course.goal}`,
      spec.throughline.exampleContract ? contractReviewBlock(spec.throughline.exampleContract) : "",
      "",
      "Sources (with refs):",
      ...(sources.length ? sources.map((s) => sourceLine(s)) : ["- (none)"]),
      "",
      "The complete candidate, Lesson by Lesson, in reading order:",
      ...outline.modules.flatMap((m) =>
        m.lessons.map((l) => {
          const content = contentById.get(l.id);
          if (!content) return `LESSON ${l.id} — "${l.title}" (missing)`;
          return [
            `LESSON ${l.id} — "${l.title}" (teaches: ${byId.get(l.id) ?? "?"})`,
            ...content.body.map(renderBlockForReview),
            ...content.workedExample.map(renderBlockForReview),
            `RECALL: ${content.recallPrompt} | SELF-EXPLAIN: ${content.selfExplanationPrompt}`,
            `EXERCISE: ${content.exercise.task} | CHECK: ${content.exercise.check}`,
            `BRIDGE: ${content.bridge}`,
            `PRIVATE CONTEXT SUMMARY: ${content.contextSummary}`,
          ].join("\n");
        }),
      ),
      "",
      "Return findings: kind is factual, summary, or continuity; lessonRefs",
      "is a nonempty array of exact Lesson ids above (use several ids when one",
      "issue spans Lessons); quote is exact text from each named Lesson or",
      "its private context summary for summary findings; detail explains the harm; correction says what to change;",
      "and an optional sourceQuery (one web search that would settle the fact). Empty array if none.",
    ].join("\n"),
  });

  if (!output) throw new GenerationError("The combined review returned nothing.");
  const lessonById = new Map(lessons.map((lesson) => [lesson.lessonId, lesson]));
  const expanded: Finding[] = [];
  const selected = output.findings.some((finding) => finding.kind === "summary")
    ? output.findings.filter((finding) => finding.kind === "summary")
    : output.findings;
  for (const f of selected) {
    if (!f.lessonRefs || f.lessonRefs.length === 0) {
      throw new GenerationError(
        `The review returned a finding with no target Lesson: ${f.detail}. A finding must name at least one Lesson.`,
      );
    }
    const quote = f.quote.trim();
    for (const ref of f.lessonRefs) {
      if (!knownIds.has(ref)) {
        throw new GenerationError(
          `The review targets Lesson "${ref}", which the candidate does not have: ${f.detail}.`,
        );
      }
      const target = lessonById.get(ref);
      const hasExactQuote =
        target &&
        (f.kind === "summary"
          ? target.contextSummary.includes(quote)
          : lessonTextSlots(target, true).some((slot) => slot.get().includes(quote)));
      if (!quote || !hasExactQuote) {
        throw new GenerationError(
          `The review quotes text that Lesson "${ref}" does not contain: ${f.quote}. Quote the Lesson exactly.`,
        );
      }
    }
    for (const ref of f.lessonRefs) {
      expanded.push({
        kind: f.kind,
        lessonRef: ref,
        quote,
        detail: f.detail,
        correction: f.correction,
        relatedLessonRefs: f.lessonRefs,
        ...(f.sourceQuery?.trim() ? { sourceQuery: f.sourceQuery.trim() } : {}),
      });
    }
  }
  return expanded;
}

// Kept for existing callers that need a compact prose rendering. Writers use
// context summaries and the complete previous Lesson instead.
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
  return text.slice(0, SIBLING_CONTEXT_MAX_CHARS);
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
      return [b.title, b.text].filter(Boolean).join("\n") || JSON.stringify(block);
    default:
      return "";
  }
}

const correctionsSchema = z.object({
  replacements: z
    .array(
      z.object({
        quote: z.string().min(1),
        replacement: z.string().min(1),
        replaceAll: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(3),
});

type TextSlot = { get: () => string; set: (value: string) => void };

function lessonTextSlots(lesson: LessonContent, includeExercise: boolean): TextSlot[] {
  const slots: TextSlot[] = [];
  const add = (owner: Record<string, unknown>, key: string) => {
    if (typeof owner[key] !== "string") return;
    slots.push({
      get: () => owner[key] as string,
      set: (value) => {
        owner[key] = value;
      },
    });
  };
  for (const block of [...lesson.body, ...lesson.workedExample]) {
    const owner = block as unknown as Record<string, unknown>;
    switch (block.kind) {
      case "p":
        add(owner, "text");
        break;
      case "code":
        add(owner, "code");
        add(owner, "caption");
        break;
      case "note":
        add(owner, "title");
        add(owner, "text");
        break;
      case "table":
        for (let i = 0; i < block.head.length; i++) {
          slots.push({
            get: () => block.head[i],
            set: (value) => {
              block.head[i] = value;
            },
          });
        }
        for (const row of block.rows) {
          for (let i = 0; i < row.length; i++) {
            slots.push({
              get: () => row[i],
              set: (value) => {
                row[i] = value;
              },
            });
          }
        }
        add(owner, "caption");
        break;
    }
  }
  add(lesson as unknown as Record<string, unknown>, "recallPrompt");
  add(lesson as unknown as Record<string, unknown>, "selfExplanationPrompt");
  add(lesson as unknown as Record<string, unknown>, "bridge");
  if (includeExercise) {
    add(lesson.exercise as unknown as Record<string, unknown>, "task");
    add(lesson.exercise as unknown as Record<string, unknown>, "check");
  }
  return slots;
}

function occurrenceCount(value: string, quote: string): number {
  return value.split(quote).length - 1;
}

export function applyLessonCorrections(
  lesson: LessonContent,
  findings: Finding[],
  replacements: z.infer<typeof correctionsSchema>["replacements"],
  preserveExercise = false,
): LessonContent {
  const expected = new Set(findings.map((finding) => finding.quote?.trim()).filter(Boolean));
  if (findings.some((finding) => !finding.quote?.trim())) {
    throw new GenerationError(`A correction for "${lesson.title}" has no exact quote to replace.`);
  }
  const proposed = new Set(replacements.map((replacement) => replacement.quote.trim()));
  if (expected.size !== proposed.size || [...expected].some((quote) => !proposed.has(quote!))) {
    throw new GenerationError(
      `The correction for "${lesson.title}" did not address the reviewed quotes exactly.`,
    );
  }

  const corrected = structuredClone(lesson);
  const slots = lessonTextSlots(corrected, !preserveExercise);
  for (const replacement of replacements) {
    const quote = replacement.quote.trim();
    const matches = slots.reduce((count, slot) => count + occurrenceCount(slot.get(), quote), 0);
    if (matches === 0) {
      throw new GenerationError(
        `The correction quote is not present in "${lesson.title}": ${quote}`,
      );
    }
    if (matches > 1 && !replacement.replaceAll) {
      throw new GenerationError(`The correction quote is ambiguous in "${lesson.title}": ${quote}`);
    }
    for (const slot of slots) {
      const current = slot.get();
      if (!current.includes(quote)) continue;
      slot.set(
        replacement.replaceAll
          ? current.split(quote).join(replacement.replacement)
          : current.slice(0, current.indexOf(quote)) +
              replacement.replacement +
              current.slice(current.indexOf(quote) + quote.length),
      );
    }
  }
  return parseLessonContent(lesson.lessonId, lesson.title, corrected);
}

export async function correctLesson(
  model: LanguageModel,
  course: { topic: string; goal: string; language: string },
  spec: CourseSpecification,
  lesson: LessonContent,
  findings: Finding[],
  priorLessons: { title: string; contextSummary: string; fullContent?: LessonContent }[],
  options?: {
    preserveExercise?: boolean;
    sources?: { ref: string; title: string; url: string; excerpt: string }[];
  },
): Promise<LessonContent> {
  const alignment = spec.alignment.find((a) => a.lessonId === lesson.lessonId);

  const { output } = await generateStructuredStage({
    stage: "lesson-correction",
    model,
    providerOptions: generationProviderOptions(),
    schema: correctionsSchema,
    prompt: [
      "You correct one Lesson of a Mikasa course after review. One job: fix the",
      "named quotes and nothing else. Return a replacement for every exact quote.",
      "Application code applies your replacements, so you cannot rewrite any",
      "unmentioned text, structure, citations, or Lesson identity. Never add new facts —",
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
            "The other Lessons' private context summaries in reading order.",
            "For Lessons named in a finding, their complete current content is also shown:",
            ...priorLessons.map((l) =>
              [
                `- ${l.title}: ${l.contextSummary}`,
                ...(l.fullContent ? [JSON.stringify(l.fullContent)] : []),
              ].join("\n"),
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
      ...findings.map(
        (f) =>
          `- [${f.kind}] QUOTE: ${f.quote ?? "(missing)"} | PROBLEM: ${f.detail} | FIX: ${f.correction}`,
      ),
      "",
      "Return JSON with replacements only. Each replacement has quote (copied exactly),",
      "replacement (the corrected text), and replaceAll. Set replaceAll only when the",
      "same reviewed quote intentionally needs the same fix everywhere in this Lesson.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (!output) {
    throw new GenerationError(`The correction for "${lesson.title}" returned nothing.`);
  }
  return applyLessonCorrections(
    lesson,
    findings,
    output.replacements,
    options?.preserveExercise ?? false,
  );
}
