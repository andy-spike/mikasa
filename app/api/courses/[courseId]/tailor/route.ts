import "server-only";

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
import { changePlanSchema, opDetail, opEntry, opVerb } from "@/lib/course/change-plan";
import { designModel, designProviderOptions } from "@/lib/model";

const turnSchema = z.object({
  message: z.string().min(1).max(4000),
  effort: z.enum(["low", "medium", "high"]).default("low"),
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
  const { message, effort } = parsed.data;

  const { courseId } = await params;
  const course = await findOwnedCourse(db, session.user.id, courseId);
  if (!course) return json(404, { error: "Course not found." });

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

  const conversationId = await findTailorConversation(db, session.user.id, courseId);
  const history = conversationId ? await listTailorMessages(db, conversationId) : [];

  const result = streamText({
    model: designModel(),
    providerOptions: designProviderOptions(effort),
    abortSignal: request.signal,
    instructions: [
      "You are the Tailor of Mikasa, a learning workspace. The Learner",
      "wants to reshape their Course: add, remove, rename, move, split, or",
      "merge Modules and Lessons, or rewrite a Lesson's prose or Exercise.",
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
      /* Only a cleanly finished stream becomes history. */
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
