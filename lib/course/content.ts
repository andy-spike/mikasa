// Plain JSON: Lesson bodies travel through Workflow steps and live in a jsonb column.
import { z } from "zod";

export type ContentBlock =
  | { kind: "p"; text: string; sourceRefs?: string[] }
  | { kind: "code"; language: string; code: string; caption?: string }
  | { kind: "note"; title: string; text: string; sourceRefs?: string[] }
  | { kind: "table"; head: string[]; rows: string[][]; caption: string };

export type LessonContent = {
  lessonId: string;
  title: string;
  body: ContentBlock[];
  workedExample: ContentBlock[];
  recallPrompt: string;
  selfExplanationPrompt: string;
  exercise: { task: string; check: string };
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
