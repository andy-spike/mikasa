import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { designProviderOptions } from "@/lib/model";
import { DesignError } from "./design";
import type { CourseSpecification, LessonAdjustment, OutlineData } from "./types";

const reconcileSchema = z.object({
  learningGraph: z.array(
    z.object({
      id: z.string(),
      skill: z.string().min(1),
      requires: z.array(z.string()),
      lessonId: z.string(),
    }),
  ),
  alignment: z.array(
    z.object({
      lessonId: z.string(),
      performance: z.string().min(1),
      prerequisiteNodes: z.array(z.string()),
      moduleMilestone: z.string().min(1),
      exerciseContribution: z.string().min(1),
    }),
  ),
});

// A spec that does not join to the Outline would poison generation.
export async function reconcileSpecification(
  model: LanguageModel,
  outline: OutlineData,
  previous: CourseSpecification,
  adjustments: LessonAdjustment[] = [],
): Promise<CourseSpecification> {
  const lessons = outline.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.title })));
  const titleFor = new Map(lessons.map((l) => [l.id, l.title]));
  const lessonIds = new Set(lessons.map((l) => l.id));
  const live = adjustments.filter((a) => lessonIds.has(a.lessonId));

  const { output } = await generateText({
    model,
    providerOptions: designProviderOptions(),
    output: Output.object({ schema: reconcileSchema }),
    prompt: [
      "A learner reshaped a course outline after it was designed. Reconcile the",
      "private specification to the new shape. The learner never sees this document.",
      "",
      `Topic: ${previous.contract.topic}`,
      `Goal: ${previous.contract.goal}`,
      `Depth: ${previous.contract.depth}.`,
      "",
      "The previous specification follows; carry over node ids wherever a node",
      "still exists in the new shape:",
      JSON.stringify(
        {
          throughline: previous.throughline,
          learningGraph: previous.learningGraph,
          alignment: previous.alignment,
        },
        null,
        1,
      ),
      "",
      "The Outline is now frozen. Use exactly these lesson ids:",
      ...lessons.map((l) => `- ${l.id} — Module "${l.module}", "${l.title}": ${l.summary}`),
      "",
      ...(live.length
        ? [
            "The learner also set concrete demands for specific Lessons. Honor",
            "them exactly, and reflect them in the alignment you produce:",
            ...live.map((a) => {
              const parts: string[] = [];
              if (a.prose) parts.push(`its prose must: ${a.prose}`);
              if (a.exercise)
                parts.push(
                  `its Exercise becomes: "${a.exercise.task}", done when: ${a.exercise.check}`,
                );
              return `- ${a.lessonId} ("${titleFor.get(a.lessonId) ?? a.lessonId}"): ${parts.join("; ")}`;
            }),
            "",
          ]
        : []),
      "Produce:",
      "- learningGraph: one node per skill/concept, each introduced by exactly one",
      "  lessonId from the list above, with requires listing node ids that come first.",
      "- alignment: for EVERY lesson id above: the performance it teaches, the graph",
      "  nodes it assumes, the module milestone it advances, and how its Exercise",
      "  contributes to the final one.",
      "",
      `Write in the course's language. Return JSON only.`,
    ].join("\n"),
  });

  if (!output) throw new DesignError("The model returned no reconciled specification.");

  const missing = lessons.filter((l) => !output.alignment.some((a) => a.lessonId === l.id));
  if (missing.length > 0) {
    throw new DesignError(
      `The reconciled specification skipped ${missing.length} Lesson(s): ${missing
        .map((l) => l.title)
        .join(", ")}.`,
    );
  }
  const nodeIds = new Set(output.learningGraph.map((n) => n.id));

  return {
    ...previous,
    learningGraph: output.learningGraph
      .filter((n) => lessonIds.has(n.lessonId))
      .map((n) => ({ ...n, requires: n.requires.filter((r) => nodeIds.has(r)) })),
    alignment: output.alignment.filter((a) => lessonIds.has(a.lessonId)),
    adjustments: live,
  };
}

function sameAdjustments(a: LessonAdjustment[], b: LessonAdjustment[]): boolean {
  if (a.length !== b.length) return false;
  const key = (x: LessonAdjustment) =>
    JSON.stringify([x.lessonId, x.prose ?? null, x.exercise ?? null]);
  const left = new Set(a.map(key));
  if (left.size !== a.length) return false;
  return b.every((x) => left.has(key(x)));
}

export function specNeedsReconciliation(
  spec: CourseSpecification,
  outline: OutlineData,
  adjustments: LessonAdjustment[],
): boolean {
  const lessons = outline.modules.flatMap((m) => m.lessons);
  if (lessons.some((l) => !spec.alignment.some((a) => a.lessonId === l.id))) return true;
  if (spec.learningGraph.some((n) => !lessons.some((l) => l.id === n.lessonId))) return true;
  return !sameAdjustments(spec.adjustments ?? [], adjustments);
}
