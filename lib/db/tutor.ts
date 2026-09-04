import "server-only";

/** Only completed turns are stored; an interrupted turn leaves nothing a retry would duplicate. */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./index";
import { courses, outlines, tutorConversations, tutorMessages } from "./schema";
import { currentRevision } from "./review";

export type TutorTurnRow = {
  id: string;
  seq: number;
  role: "learner" | "tutor";
  content: string;
  createdAt: Date;
};

export type ConversationResolution =
  | { ok: true; conversationId: string | undefined }
  | { ok: false; reason: "not-found" | "not-published" | "unknown-lesson"; message: string };

export async function findTutorConversation(
  db: Db,
  ownerId: string,
  courseId: string,
  lessonRef: string,
): Promise<ConversationResolution> {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .limit(1);
  if (!course) {
    return { ok: false, reason: "not-found", message: "Course not found." };
  }

  const revision = await currentRevision(db, courseId);
  if (!revision) {
    return {
      ok: false,
      reason: "not-published",
      message: "This Course has not been published yet.",
    };
  }

  const [outline] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.courseId, courseId), eq(outlines.version, revision.outlineVersion)))
    .limit(1);
  const planned = outline?.data.modules.flatMap((m) => m.lessons.map((l) => l.id)) ?? [];
  if (!planned.includes(lessonRef)) {
    return {
      ok: false,
      reason: "unknown-lesson",
      message: "That Lesson is not part of the Course as it is published.",
    };
  }

  const [existing] = await db
    .select()
    .from(tutorConversations)
    .where(
      and(eq(tutorConversations.courseId, courseId), eq(tutorConversations.lessonRef, lessonRef)),
    )
    .limit(1);
  return { ok: true, conversationId: existing?.id };
}

export async function listTutorMessages(db: Db, conversationId: string): Promise<TutorTurnRow[]> {
  const rows = await db
    .select()
    .from(tutorMessages)
    .where(eq(tutorMessages.conversationId, conversationId))
    .orderBy(asc(tutorMessages.seq));
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    role: r.role as "learner" | "tutor",
    content: r.content,
    createdAt: r.createdAt,
  }));
}

export async function loadTutorHistory(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<Map<string, TutorTurnRow[]>> {
  const conversations = await db
    .select({ id: tutorConversations.id, lessonRef: tutorConversations.lessonRef })
    .from(tutorConversations)
    .innerJoin(courses, eq(courses.id, tutorConversations.courseId))
    .where(and(eq(tutorConversations.courseId, courseId), eq(courses.ownerId, ownerId)));
  if (conversations.length === 0) return new Map();

  const ids = conversations.map((c) => c.id);
  const messages = await db
    .select()
    .from(tutorMessages)
    .where(inArray(tutorMessages.conversationId, ids))
    .orderBy(asc(tutorMessages.seq));

  const byConversation = new Map<string, TutorTurnRow[]>();
  for (const m of messages) {
    const list = byConversation.get(m.conversationId) ?? [];
    list.push({
      id: m.id,
      seq: m.seq,
      role: m.role as "learner" | "tutor",
      content: m.content,
      createdAt: m.createdAt,
    });
    byConversation.set(m.conversationId, list);
  }

  const byLesson = new Map<string, TutorTurnRow[]>();
  for (const c of conversations) {
    const turns = byConversation.get(c.id) ?? [];
    if (turns.length > 0) byLesson.set(c.lessonRef, turns);
  }
  return byLesson;
}

/** Both sides land together in one transaction; a concurrent sequence claim retries once against the new head. */
export async function appendTutorTurn(
  db: Db,
  ownerId: string,
  courseId: string,
  lessonRef: string,
  turn: { learner: string; tutor: string },
): Promise<{ learner: TutorTurnRow; tutor: TutorTurnRow }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        await tx.insert(tutorConversations).values({ courseId, lessonRef }).onConflictDoNothing();
        const [conversation] = await tx
          .select()
          .from(tutorConversations)
          .where(
            and(
              eq(tutorConversations.courseId, courseId),
              eq(tutorConversations.lessonRef, lessonRef),
            ),
          )
          .limit(1);

        const [head] = await tx
          .select({ seq: tutorMessages.seq })
          .from(tutorMessages)
          .where(eq(tutorMessages.conversationId, conversation.id))
          .orderBy(desc(tutorMessages.seq))
          .limit(1);
        const base = head?.seq ?? 0;

        const inserted = await tx
          .insert(tutorMessages)
          .values([
            {
              conversationId: conversation.id,
              seq: base + 1,
              role: "learner",
              content: turn.learner,
            },
            { conversationId: conversation.id, seq: base + 2, role: "tutor", content: turn.tutor },
          ])
          .returning();

        const [learnerRow, tutorRow] = inserted;
        return {
          learner: {
            id: learnerRow.id,
            seq: learnerRow.seq,
            role: "learner" as const,
            content: learnerRow.content,
            createdAt: learnerRow.createdAt,
          },
          tutor: {
            id: tutorRow.id,
            seq: tutorRow.seq,
            role: "tutor" as const,
            content: tutorRow.content,
            createdAt: tutorRow.createdAt,
          },
        };
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505" && attempt === 0) continue; // unique_violation: re-read the head
      throw error;
    }
  }
  throw new Error("unreachable");
}
