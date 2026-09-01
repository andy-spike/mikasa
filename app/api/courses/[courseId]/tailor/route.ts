import "server-only";

/**
 * The Tailor's turn endpoint (ticket #12). A separate, persistent,
 * streamed conversation about reshaping the Course. The Tailor proposes
 * a Change plan through one tool, whose schema validates every
 * operation; the plan is stored for the Learner to review operation by
 * operation. Nothing here changes the Course — review is read-only by
 * design, and application lives in tickets #13/#14.
 */
import { headers } from "next/headers";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { isStepCount, streamText, tool } from "ai";
import { db } from "@/lib/db";
import { auth } from "@/lib/session";
import { findOwnedCourse } from "@/lib/db/courses";
import { outlines } from "@/lib/db/schema";
import {
  appendTailorTurn,
  createChangePlan,
  findTailorConversation,
  listTailorMessages,
} from "@/lib/db/tailor";
import {
  changePlanSchema,
  opDetail,
  opEntry,
  opVerb,
} from "@/lib/course/change-plan";
import { designModel, designProviderOptions } from "@/lib/model";

const turnSchema = z.object({
  message: z.string().min(1).max(4000),
});

function json(status: number, body: { error: string }) {
  return Response.json(body, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return json(401, { error: "Sign in to talk with the Tailor." });

  const parsed = turnSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "That request was not a Tailor turn." });
  const { message } = parsed.data;

  const { courseId } = await params;
  const course = await findOwnedCourse(db, session.user.id, courseId);
  if (!course) return json(404, { error: "Course not found." });

  /* The shape the Tailor tailors: ids, titles, order. */
  const [outline] = await db
    .select()
    .from(outlines)
    .where(eq(outlines.courseId, courseId))
    .orderBy(desc(outlines.version))
    .limit(1);
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

  /* The conversation exists only if a turn already completed; the model
     gets whatever history there is, and a first turn starts clean. */
  const conversationId = await findTailorConversation(db, session.user.id, courseId);
  const history = conversationId ? await listTailorMessages(db, conversationId) : [];

  const result = streamText({
    model: designModel(),
    providerOptions: designProviderOptions(),
    abortSignal: request.signal,
    instructions: [
      "You are the Tailor of Mikasa, a learning workspace. The Learner",
      "wants to reshape their Course: add, remove, rename, move, split, or",
      "merge Modules and Lessons, or rewrite a Lesson's prose or Exercise.",
      "",
      "Listen to what the Learner wants changed and why. When you know",
      "enough, call proposeChangePlan with every operation the change",
      "needs, in order. Use the Lesson and Module ids from the Course's",
      "shape below. Then say, briefly and concretely, what you proposed",
      "and why — the Learner accepts or discards each operation, and",
      "nothing changes until they apply the accepted ones.",
      "",
      "If the Learner only asks a question, answer it in plain prose and",
      "propose nothing. If a request is vague, ask what they mean before",
      "proposing. Never promise the change is done: proposing is not",
      "applying.",
      "",
      "The Course's shape (ids are stable; use them exactly):",
      JSON.stringify(shape),
      "",
      `Language: answer in ${course.language}.`,
    ].join("\n"),
    messages: [
      ...history.map((turn) =>
        turn.role === "learner"
          ? ({ role: "user", content: turn.content } as const)
          : ({ role: "assistant", content: turn.content } as const),
      ),
      { role: "user", content: message },
    ],
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
      /* Only a cleanly finished stream becomes history — the conversation
         itself is born here, on the first completed turn. */
      const text =
        event.content
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("") || event.text;
      if (!text.trim()) return;
      await appendTailorTurn(db, session.user.id, courseId, {
        learner: message,
        tailor: text,
      });
    },
  });

  return new Response(result.textStream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
