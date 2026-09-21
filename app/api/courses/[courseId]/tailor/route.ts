import "server-only";

import { headers } from "next/headers";
import { z } from "zod";
import { isStepCount, streamText, tool } from "ai";
import { db } from "@/lib/db";
import { auth } from "@/lib/session";
import { findOwnedCourse } from "@/lib/db/courses";
import {
  appendTailorTurn,
  createChangePlan,
  createTailorConversation,
  findTailorConversation,
  listTailorMessages,
} from "@/lib/db/tailor";
import { changePlanSchema, opDetail, opEntry, opVerb } from "@/lib/course/change-plan";
import { designModel, designProviderOptions } from "@/lib/model";
import { latestOutline } from "@/lib/db/design";
import { collectStreamText, jsonError, uiMessageStreamResponse } from "@/lib/api/stream";
import { historyMessages } from "@/lib/course/tutor";

const turnSchema = z.object({
  message: z.string().min(1).max(4000),
  /* The chat the turn belongs to. null opens a fresh one; omitted asks for
     the Course's newest chat. */
  conversationId: z.string().uuid().nullish(),
  effort: z.enum(["low", "medium", "high"]).default("low"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return jsonError(401, "Sign in to talk with the Tailor.");

  const parsed = turnSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "That request was not a Tailor turn.");
  const { message, effort, conversationId: requestedChatId } = parsed.data;

  const { courseId } = await params;
  const course = await findOwnedCourse(db, session.user.id, courseId);
  if (!course) return jsonError(404, "Course not found.");

  const outline = await latestOutline(db, courseId);
  const shape = outline
    ? outline.data.modules.map((m) => ({
        moduleId: m.id,
        title: m.title,
        lessons: m.lessons.map((l) => ({
          lessonId: l.id,
          title: l.title,
          summary: l.summary,
        })),
      }))
    : [];

  /* null asks for a fresh chat; the row is created when a turn completes, so
     a stream that fails leaves no empty chat behind. Omitted or an id both
     resolve to a stored chat. */
  let chatId: string | undefined;
  if (requestedChatId !== null) {
    chatId = await findTailorConversation(
      db,
      session.user.id,
      courseId,
      requestedChatId ?? undefined,
    );
  }
  const history = chatId ? await listTailorMessages(db, chatId) : [];

  const result = streamText({
    model: designModel(),
    providerOptions: designProviderOptions(effort),
    abortSignal: request.signal,
    instructions: [
      "You are the Tailor of Mikasa, a learning workspace. The Learner",
      "wants to reshape their Course: add, remove, rename, move, or split",
      "Modules and Lessons, or rewrite a Lesson's prose or Exercise.",
      "",
      "Rules:",
      "- Propose at most 10 operations per plan, in apply order. Larger",
      "  reshapes become follow-up plans.",
      "- Use only the Lesson and Module ids from the Course's shape below.",
      "  Use them exactly. If the request names an id that is not in the",
      "  shape, refuse that part and propose nothing for it.",
      "- If the Learner only asks a question and requests no change, answer",
      "  it in plain prose and never call proposeChangePlan.",
      "- If the request is vague or missing a target, ask exactly one",
      "  clarifying question and propose nothing until they answer.",
      "- After calling proposeChangePlan, reply in this fixed shape:",
      "  1) What changed (one line per op). 2) Op list with ids. 3) What",
      "  needs approval. Nothing else.",
      "- Never say the change is done or applied. Say only what you proposed.",
      "  Nothing changes until the Learner accepts and applies it.",
      "",
      "The Course's shape (ids are stable; use them exactly):",
      JSON.stringify(shape),
      "",
      `Language: always answer in ${course.language}, the course language.`,
    ].join("\n"),
    messages: historyMessages(history, message),
    tools: {
      proposeChangePlan: tool({
        description:
          "Propose a Change plan: the ordered operations that carry out the Learner's requested change. Nothing is applied until the Learner accepts and applies it.",
        inputSchema: changePlanSchema,
        execute: async ({ ops }) => {
          const created = await createChangePlan(db, session.user.id, courseId, ops);
          if (!created.ok) {
            return { ok: false as const, error: created.message };
          }
          return {
            ok: true as const,
            planId: created.plan.id,
            operations: created.plan.operations.map((op) => ({
              verb: opVerb(op.payload),
              entry: opEntry(op.payload),
              detail: opDetail(op.payload),
            })),
          };
        },
      }),
    },
    stopWhen: [isStepCount(4)],
    onEnd: async (event) => {
      /* Only a cleanly finished stream becomes history. */
      const text = collectStreamText(event);
      if (!text.trim()) return;
      const target = chatId ?? (await createTailorConversation(db, courseId));
      await appendTailorTurn(db, target, {
        learner: message,
        tailor: text,
      });
    },
  });

  return uiMessageStreamResponse(result.stream, "The Tailor could not finish that plan.");
}
