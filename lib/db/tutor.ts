import "server-only";

/** Only completed turns are stored; an interrupted turn leaves nothing a retry would duplicate. */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./index";
import { courses, outlines, tutorConversations, tutorMessages } from "./schema";
import { currentRevision } from "./review";
import { outlineLessonRefs } from "../course/structure";

export type TutorTurnRow = {
  id: string;
  seq: number;
  role: "learner" | "tutor";
  content: string;
  anchor: string | null;
  createdAt: Date;
};

/** One chat in a Lesson's margin. A Lesson may hold several; the newest is
 *  the one the margin opens, and the rest wait behind Previous chats. */
export type TutorChat = {
  id: string;
  createdAt: Date;
  turns: TutorTurnRow[];
};

function toTutorTurnRow(r: {
  id: string;
  seq: number;
  role: string;
  content: string;
  anchor: string | null;
  createdAt: Date;
}): TutorTurnRow {
  return {
    id: r.id,
    seq: r.seq,
    role: r.role as TutorTurnRow["role"],
    content: r.content,
    anchor: r.anchor,
    createdAt: r.createdAt,
  };
}

export type ConversationResolution =
  | { ok: true; conversationId: string | undefined }
  | { ok: false; reason: "not-found" | "not-published" | "unknown-lesson"; message: string };

export async function findTutorConversation(
  db: Db,
  ownerId: string,
  courseId: string,
  lessonRef: string,
  conversationId?: string,
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
  const planned = outline ? outlineLessonRefs(outline.data) : [];
  if (!planned.includes(lessonRef)) {
    return {
      ok: false,
      reason: "unknown-lesson",
      message: "That Lesson is not part of the Course as it is published.",
    };
  }

  if (conversationId) {
    const [chat] = await db
      .select({ id: tutorConversations.id })
      .from(tutorConversations)
      .where(
        and(
          eq(tutorConversations.id, conversationId),
          eq(tutorConversations.courseId, courseId),
          eq(tutorConversations.lessonRef, lessonRef),
        ),
      )
      .limit(1);
    if (!chat) {
      return {
        ok: false,
        reason: "not-found",
        message: "That chat is not part of this Lesson.",
      };
    }
    return { ok: true, conversationId: chat.id };
  }

  const [latest] = await db
    .select({ id: tutorConversations.id })
    .from(tutorConversations)
    .where(
      and(eq(tutorConversations.courseId, courseId), eq(tutorConversations.lessonRef, lessonRef)),
    )
    .orderBy(desc(tutorConversations.createdAt), desc(tutorConversations.id))
    .limit(1);
  return { ok: true, conversationId: latest?.id };
}

/** Starts a chat in the Lesson's margin. New chats are rows, not rewrites:
 *  the older ones stay readable behind Previous chats. */
export async function createTutorConversation(
  db: Db,
  courseId: string,
  lessonRef: string,
): Promise<string> {
  const [chat] = await db.insert(tutorConversations).values({ courseId, lessonRef }).returning();
  return chat.id;
}

export async function listTutorMessages(db: Db, conversationId: string): Promise<TutorTurnRow[]> {
  const rows = await db
    .select()
    .from(tutorMessages)
    .where(eq(tutorMessages.conversationId, conversationId))
    .orderBy(asc(tutorMessages.seq));
  return rows.map(toTutorTurnRow);
}

export async function loadTutorHistory(
  db: Db,
  ownerId: string,
  courseId: string,
): Promise<Map<string, TutorChat[]>> {
  const conversations = await db
    .select({
      id: tutorConversations.id,
      lessonRef: tutorConversations.lessonRef,
      createdAt: tutorConversations.createdAt,
    })
    .from(tutorConversations)
    .innerJoin(courses, eq(courses.id, tutorConversations.courseId))
    .where(and(eq(tutorConversations.courseId, courseId), eq(courses.ownerId, ownerId)))
    .orderBy(asc(tutorConversations.createdAt), asc(tutorConversations.id));
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
    list.push(toTutorTurnRow(m));
    byConversation.set(m.conversationId, list);
  }

  /* Oldest chat first; a chat with no turns yet is not history. */
  const byLesson = new Map<string, TutorChat[]>();
  for (const c of conversations) {
    const turns = byConversation.get(c.id) ?? [];
    if (turns.length === 0) continue;
    const chats = byLesson.get(c.lessonRef) ?? [];
    chats.push({ id: c.id, createdAt: c.createdAt, turns });
    byLesson.set(c.lessonRef, chats);
  }
  return byLesson;
}

/** Both sides land together in one transaction; a concurrent sequence claim retries once against the new head. */
export async function appendTutorTurn(
  db: Db,
  conversationId: string,
  turn: { learner: string; tutor: string; anchor?: string | null },
): Promise<{ learner: TutorTurnRow; tutor: TutorTurnRow }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [head] = await tx
          .select({ seq: tutorMessages.seq })
          .from(tutorMessages)
          .where(eq(tutorMessages.conversationId, conversationId))
          .orderBy(desc(tutorMessages.seq))
          .limit(1);
        const base = head?.seq ?? 0;

        const inserted = await tx
          .insert(tutorMessages)
          .values([
            {
              conversationId,
              seq: base + 1,
              role: "learner",
              content: turn.learner,
              anchor: turn.anchor ?? null,
            },
            { conversationId, seq: base + 2, role: "tutor", content: turn.tutor },
          ])
          .returning();

        const [learnerRow, tutorRow] = inserted;
        return { learner: toTutorTurnRow(learnerRow), tutor: toTutorTurnRow(tutorRow) };
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505" && attempt === 0) continue; // unique_violation: re-read the head
      throw error;
    }
  }
  throw new Error("unreachable");
}
