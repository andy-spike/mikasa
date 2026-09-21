import "server-only";

import { headers } from "next/headers";
import { z } from "zod";
import { isStepCount, streamText } from "ai";
import { db } from "@/lib/db";
import { auth } from "@/lib/session";
import { findOwnedPublishedCourse } from "@/lib/db/review";
import { findCourseSpec } from "@/lib/db/design";
import {
  appendTutorTurn,
  createTutorConversation,
  findTutorConversation,
  listTutorMessages,
} from "@/lib/db/tutor";
import { toReadingCourse, toSourceLinks } from "@/lib/course/reading";
import { tutorPrompt, tutorSystemPrompt } from "@/lib/course/tutor";
import { tutorTools } from "@/lib/course/tutor-tools";
import { embedQuery, tutorModel, tutorProviderOptions } from "@/lib/model";
import { webSearch } from "@/lib/web/firecrawl";
import { collectStreamText, jsonError, uiMessageStreamResponse } from "@/lib/api/stream";

const turnSchema = z.object({
  lessonId: z.string().min(1),
  message: z.string().min(1).max(4000),
  /* The passage a selection grew the question from; the reader's quote
     rides with the turn so it can be found in the Lesson again. */
  anchor: z.string().min(1).max(600).optional(),
  /* The chat the turn belongs to. null opens a fresh one; omitted asks for
     the Lesson's newest chat. */
  conversationId: z.string().uuid().nullish(),
  effort: z.enum(["low", "medium", "high"]).default("low"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return jsonError(401, "Sign in to talk with the Tutor.");

  const parsed = turnSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "That request was not a Tutor turn.");
  const { lessonId, message, effort, anchor, conversationId } = parsed.data;

  const { courseId } = await params;
  const published = await findOwnedPublishedCourse(db, session.user.id, courseId);
  if (!published) return jsonError(404, "Course not found.");

  const reading = toReadingCourse(published.course, published.outline.data, published.lessonRows);
  const lesson = reading.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  if (!lesson) return jsonError(409, "That Lesson is not part of the Course as it is published.");

  /* null asks for a fresh chat; the row is created when a turn completes, so
     a stream that fails leaves no empty chat behind. Omitted or an id both
     resolve to a stored chat. */
  let chatId: string | undefined;
  if (conversationId !== null) {
    const conversation = await findTutorConversation(
      db,
      session.user.id,
      courseId,
      lessonId,
      conversationId ?? undefined,
    );
    if (!conversation.ok) {
      return jsonError(conversation.reason === "not-found" ? 404 : 409, conversation.message);
    }
    chatId = conversation.conversationId;
  }
  const history = chatId ? await listTutorMessages(db, chatId) : [];

  const spec = await findCourseSpec(db, courseId, published.revision.outlineVersion);

  const result = streamText({
    model: tutorModel(),
    providerOptions: tutorProviderOptions(effort),
    abortSignal: request.signal,
    instructions: tutorSystemPrompt({
      course: { topic: reading.topic, goal: reading.goal },
      outline: reading.modules.map((m) => ({
        numeral: m.numeral,
        title: m.title,
        lessons: m.lessons.map((l) => ({ title: l.title })),
      })),
      spec: {
        depth: spec?.contract.depth ?? published.course.depth,
        language: spec?.contract.language ?? published.course.language,
        terminalPerformances: spec?.contract.terminalPerformances ?? [],
        premise: spec?.throughline.premise ?? "",
        finalExercise: spec?.finalExercise ?? { task: "", acceptanceChecks: [] },
      },
      lesson,
      sources: [...toSourceLinks(published.sourceRows).values()],
    }),
    messages: tutorPrompt(history, message),
    tools: tutorTools({ db, courseId, embedQuery, webSearch }),
    stopWhen: [isStepCount(4)],
    onEnd: async (event) => {
      /* Only a cleanly finished stream becomes history. */
      const text = collectStreamText(event);
      if (!text.trim()) return;
      const target = chatId ?? (await createTutorConversation(db, courseId, lessonId));
      await appendTutorTurn(db, target, {
        learner: message,
        tutor: text,
        anchor: anchor ?? null,
      });
    },
  });

  return uiMessageStreamResponse(result.stream, "The Tutor could not finish that answer.");
}
