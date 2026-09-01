import "server-only";

/**
 * The Tutor's turn endpoint (ticket #10). One POST per turn: authorize,
 * resolve the conversation, stream the answer, and — only if the stream
 * finished cleanly — store the completed turn as canonical history.
 *
 * The client sends just the Lesson it is reading, the message, and
 * nothing else; the server owns everything else about the conversation.
 */
import { headers } from "next/headers";
import { z } from "zod";
import { isStepCount, streamText } from "ai";
import { db } from "@/lib/db";
import { auth } from "@/lib/session";
import { findOwnedPublishedCourse } from "@/lib/db/review";
import { findCourseSpec } from "@/lib/db/design";
import {
  appendTutorTurn,
  findTutorConversation,
  listTutorMessages,
} from "@/lib/db/tutor";
import { toReadingCourse, toSourceLinks } from "@/lib/course/reading";
import { tutorPrompt, tutorSystemPrompt } from "@/lib/course/tutor";
import { tutorTools } from "@/lib/course/tutor-tools";
import { embedQuery, tutorModel, tutorProviderOptions } from "@/lib/model";
import { webSearch } from "@/lib/web/firecrawl";

const turnSchema = z.object({
  lessonId: z.string().min(1),
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
  if (!session) return json(401, { error: "Sign in to talk with the Tutor." });

  const parsed = turnSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "That request was not a Tutor turn." });
  const { lessonId, message } = parsed.data;

  const { courseId } = await params;
  const published = await findOwnedPublishedCourse(db, session.user.id, courseId);
  if (!published) return json(404, { error: "Course not found." });

  /* The conversation exists only if a turn already completed; the model
     gets whatever history there is, and a first turn starts clean. */
  const conversation = await findTutorConversation(db, session.user.id, courseId, lessonId);
  if (!conversation.ok) {
    return json(conversation.reason === "not-found" ? 404 : 409, {
      error: conversation.message,
    });
  }
  const history = conversation.conversationId
    ? await listTutorMessages(db, conversation.conversationId)
    : [];

  /* The context the Tutor reads, in the reading adapter's own terms. */
  const reading = toReadingCourse(
    published.course,
    published.outline.data,
    published.lessonRows,
  );
  const lesson = reading.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  if (!lesson) return json(409, { error: "That Lesson is not part of the Course as it is published." });

  const spec = await findCourseSpec(db, courseId);

  const result = streamText({
    model: tutorModel(),
    providerOptions: tutorProviderOptions(),
    /* No tools: the Tutor can change nothing in the Course. */
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
    /* The Tutor reads, it never writes, and it does not wander: at most
       four agent steps (search, read, answer) before it must speak. */
    stopWhen: [isStepCount(4)],
    onEnd: async (event) => {
      /* Only a cleanly finished stream becomes history. An error or an
         abort never lands here, so the turn leaves no trace to duplicate. */
      const text =
        event.content
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("") || event.text;
      if (!text.trim()) return;
      await appendTutorTurn(db, session.user.id, courseId, lessonId, {
        learner: message,
        tutor: text,
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
