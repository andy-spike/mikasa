import type { LanguageModel } from "ai";
import { z } from "zod";
import { generationProviderOptions } from "@/lib/model";
import { lessonContextSummarySchema, type LessonContent } from "./content";
import { languageName } from "./prompt-blocks";
import { GenerationError } from "./specification";
import { generateStructuredStage } from "./structured-generation";

const summaryResponseSchema = z.object({ contextSummary: z.string() });

export async function regenerateLessonContextSummary(
  model: LanguageModel,
  courseLanguage: string,
  lesson: Omit<LessonContent, "contextSummary">,
): Promise<string> {
  const { output } = await generateStructuredStage({
    stage: "lesson-context-summary",
    model,
    providerOptions: generationProviderOptions(),
    schema: summaryResponseSchema,
    prompt: [
      "Read this completed Lesson and write only its private contextSummary.",
      "Future Lessons use it to preserve exact shared example changes, names,",
      "decisions, and promises. Do not write a teaching recap or invent facts.",
      `Write in ${languageName(courseLanguage)}. Copy technical names and identifiers exactly.`,
      "Use at most 80 words. Return JSON with contextSummary only.",
      JSON.stringify(lesson),
    ].join("\n"),
  });
  const checked = lessonContextSummarySchema.safeParse(output?.contextSummary);
  if (!checked.success) {
    throw new GenerationError(`The context summary for "${lesson.title}" is invalid.`);
  }
  return checked.data;
}
