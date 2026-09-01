"use server";

/**
 * Completion actions (ticket #8): the Lesson pane's mark and undo. Thin —
 * authorize, delegate to `lib/db/completion`, which enforces ownership and
 * publication in the query.
 */
import { db } from "@/lib/db";
import { requireLearner } from "@/lib/session";
import { markLessonDone, markLessonUndone, type MarkResult } from "@/lib/db/completion";

export type CompletionActionResult = MarkResult;

export async function markLessonDoneAction(
  courseId: string,
  lessonId: string,
): Promise<CompletionActionResult> {
  const { user } = await requireLearner();
  return markLessonDone(db, user.id, courseId, lessonId);
}

export async function markLessonUndoneAction(
  courseId: string,
  lessonId: string,
): Promise<CompletionActionResult> {
  const { user } = await requireLearner();
  return markLessonUndone(db, user.id, courseId, lessonId);
}
