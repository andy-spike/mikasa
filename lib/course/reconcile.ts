/**
 * Specification reconciliation: when the Learner changes the Outline after
 * design, the private specification falls out of step with it. Approval
 * (and nothing else) reconciles the two, so generation starts from a spec
 * that references exactly the Lessons the approved Outline has.
 *
 * Like the rest of design, this is a plain function with the model
 * injected; the workflow-less caller is `approveOutlineAction`.
 *
 * What survives untouched: the contract, the throughline, the final
 * Exercise, and the evidence ledger (Source refs are independent of
 * structure). What the model rewrites: the learning graph and the
 * per-Lesson alignment, keeping existing node ids wherever a node carries
 * over, so downstream references stay meaningful.
 */
import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { designProviderOptions } from "@/lib/model";
import { DesignError } from "./design";
import type { CourseSpecification, OutlineData } from "./types";

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

/**
 * Rewrites the graph and alignment against the current Outline. Throws
 * `DesignError` when the model skips a Lesson or invents ids: a spec that
 * does not join to the Outline would poison generation.
 */
export async function reconcileSpecification(
  model: LanguageModel,
  outline: OutlineData,
  previous: CourseSpecification,
): Promise<CourseSpecification> {
  const lessons = outline.modules.flatMap((m) =>
    m.lessons.map((l) => ({ ...l, module: m.title })),
  );

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

  const lessonIds = new Set(lessons.map((l) => l.id));
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
  };
}
