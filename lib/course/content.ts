/**
 * The content a Lesson is made of. Plain JSON: Lesson bodies travel
 * through Workflow steps and live in a jsonb column, so every field must
 * survive JSON round-trips.
 *
 * Blocks follow the vocabulary the Graphite prose renderer already speaks
 * — paragraph, code, note, table — with two additions generation needs:
 * code carries its language (the demo's `sql` block is a code block with
 * the language "sql"), and prose and notes can carry Source refs so
 * publication (ticket #6) can render inline Source links.
 */
import { z } from "zod";

export type ContentBlock =
  | { kind: "p"; text: string; sourceRefs?: string[] }
  | { kind: "code"; language: string; code: string; caption?: string }
  | { kind: "note"; title: string; text: string; sourceRefs?: string[] }
  | { kind: "table"; head: string[]; rows: string[][]; caption: string };

/** The six parts every Lesson must have (user story 25). */
export type LessonContent = {
  /** The stable Outline Lesson id this content belongs to. */
  lessonId: string;
  title: string;
  /** The explanatory prose. */
  body: ContentBlock[];
  /** The worked example, as its own run of blocks. */
  workedExample: ContentBlock[];
  /** A prompt the Learner answers from memory. */
  recallPrompt: string;
  /** A prompt about why the worked example is the way it is. */
  selfExplanationPrompt: string;
  /** The one Exercise; completing it completes the Lesson (ticket #8). */
  exercise: { task: string; check: string };
  /** A bridge to the next Lesson (or, for the last, to the final Exercise). */
  bridge: string;
};

const blockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("p"),
    text: z.string().min(1),
    sourceRefs: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("code"),
    language: z.string().min(1),
    code: z.string().min(1),
    caption: z.string().optional(),
  }),
  z.object({
    kind: z.literal("note"),
    title: z.string().min(1),
    text: z.string().min(1),
    sourceRefs: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("table"),
    head: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
    caption: z.string().min(1),
  }),
]);

const lessonContentSchema = z.object({
  body: z.array(blockSchema).min(1),
  workedExample: z.array(blockSchema).min(1),
  recallPrompt: z.string().min(1),
  selfExplanationPrompt: z.string().min(1),
  exercise: z.object({ task: z.string().min(1), check: z.string().min(1) }),
  bridge: z.string().min(1),
});

export function parseLessonContent(lessonId: string, title: string, value: unknown): LessonContent {
  const parsed = lessonContentSchema.parse(value);
  return { lessonId, title, ...parsed };
}
