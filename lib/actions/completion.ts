"use server";

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
