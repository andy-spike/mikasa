import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { designProviderOptions } from "@/lib/model";
import { DesignError } from "./design";
import { outlineLessonsWithModule } from "./spec-graph";
import type { CourseSpecification, LessonAdjustment, OutlineData } from "./types";

const reconcileSchema = z.object({
  learningGraph: z.array(
    z.object({
      id: z.string().regex(/^g\d+$/),
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
      exampleStart: z.string(),
      exampleEnd: z.string(),
      sourceRefs: z.array(z.string()),
    }),
  ),
});

// A spec that does not join to the Outline would poison generation.
export async function reconcileSpecification(
  model: LanguageModel,
  outline: OutlineData,
  previous: CourseSpecification,
  adjustments: LessonAdjustment[] = [],
  validationErrors?: string[],
): Promise<CourseSpecification> {
  const lessons = outlineLessonsWithModule(outline);
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
      "Precedence, in order: 1) fix every validation error below. 2) honor the",
      "learner demands. 3) carry over old node ids where they still fit. Validation",
      "errors beat learner demands when they clash.",
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
      ...(validationErrors?.length
        ? [
            "The previous attempt failed validation with these errors. Fix every one;",
            "do not reorder the Outline or drop references silently:",
            ...validationErrors.map((e) => `- ${e}`),
            "",
          ]
        : []),
      ...(live.length
        ? [
            "The learner also set concrete demands for specific Lessons. Honor",
            "them exactly, and reflect them in the alignment you produce:",
            ...live.map((a) => {
              const text = [
                a.prose && `its prose must: ${a.prose}`,
                a.exercise &&
                  `its Exercise becomes: "${a.exercise.task}", done when: ${a.exercise.check}`,
              ]
                .filter(Boolean)
                .join("; ");
              return `- ${a.lessonId} ("${titleFor.get(a.lessonId) ?? a.lessonId}"): ${text}`;
            }),
            "",
          ]
        : []),
      "Produce:",
      "- learningGraph: one node per skill/concept (ids g1, g2, ... matching /^g\\d+$/; every id unique), each introduced by exactly one",
      "  lessonId from the list above, with requires listing only node ids introduced at the same or an earlier Lesson.",
      "- alignment: for EVERY lesson id above: the performance it teaches (distinct from every other Lesson's performance; two Lessons with the same performance read as duplicate Lessons), the graph",
      "  nodes it assumes (same-or-earlier only), the module milestone it advances, how its Exercise",
      "  contributes to the final one, exampleStart and exampleEnd (the shared running example before and after; empty when none),",
      "  and sourceRefs (stored Source refs this Lesson leans on; empty is fine).",
      "",
      `Final Exercise (every Lesson builds toward it): ${previous.finalExercise.task} Done when: ${previous.finalExercise.acceptanceChecks.join("; ")}.`,
      "",
      `Write in the course's language. Return JSON only.`,
    ].join("\n"),
  });

  if (!output) throw new DesignError("The model returned no reconciled specification.");

  const candidate: CourseSpecification = {
    ...previous,
    learningGraph: output.learningGraph,
    alignment: output.alignment,
    adjustments: live,
  };
  // Fail loudly on holes or bad ids instead of filtering them away. The
  // caller validates against stored Sources and retries once with errors.
  const lessonSet = new Set(lessons.map((l) => l.id));
  const alignedIds = new Set(output.alignment.map((a) => a.lessonId));
  const missing = lessons.filter((l) => !alignedIds.has(l.id));
  if (missing.length > 0) {
    throw new DesignError(
      `The reconciled specification skipped ${missing.length} Lesson(s): ${missing
        .map((l) => l.title)
        .join(", ")}.`,
    );
  }
  const extra = output.alignment.filter((a) => !lessonSet.has(a.lessonId));
  if (extra.length > 0) {
    throw new DesignError(
      `The reconciled specification aligns unknown Lesson(s): ${extra.map((a) => a.lessonId).join(", ")}. Use the approved Outline ids.`,
    );
  }
  const nodeIds = new Set(output.learningGraph.map((n) => n.id));
  if (nodeIds.size !== output.learningGraph.length) {
    throw new DesignError(
      "The reconciled specification reuses a graph node id. Give every node a unique id.",
    );
  }
  for (const n of output.learningGraph) {
    if (!lessonSet.has(n.lessonId)) {
      throw new DesignError(
        `The reconciled node "${n.id}" points at Lesson "${n.lessonId}", which the Outline does not have.`,
      );
    }
    for (const r of n.requires) {
      if (!nodeIds.has(r)) {
        throw new DesignError(`Reconciled node "${n.id}" requires unknown node "${r}".`);
      }
    }
  }
  return candidate;
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
  const lessonIds = new Set(outline.modules.flatMap((m) => m.lessons.map((l) => l.id)));
  const alignedIds = new Set(spec.alignment.map((a) => a.lessonId));
  if ([...lessonIds].some((id) => !alignedIds.has(id))) return true;
  if (spec.learningGraph.some((n) => !lessonIds.has(n.lessonId))) return true;
  return !sameAdjustments(spec.adjustments ?? [], adjustments);
}
