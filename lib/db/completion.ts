/**
 * Completion (ticket #8): marking a Lesson's Exercise done, and the
 * Course's own completion when every Lesson of the current published
 * revision is done. Every write goes through the owned, published Course,
 * so Completion belongs to exactly one Learner by construction.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "./index";
import { completions, courses, outlines } from "./schema";
import { currentRevision } from "./review";
import { formatDayStamp } from "@/lib/utils";

/** The Lesson's day of completion, as the stamp reads it ("28 AUG"). */
function stampOf(date: Date): string {
  return formatDayStamp(date);
}

export type MarkResult =
  | {
      ok: true;
      /** The day stamped on the Lesson ("28 AUG"). */
      stamp: string;
      doneCount: number;
      total: number;
      /** True when this mark completed the whole Course. */
      courseComplete: boolean;
    }
  | { ok: false; reason: "not-found" | "not-published" | "unknown-lesson"; message: string };

async function ownedPublishedLesson(
  db: Db,
  ownerId: string,
  courseId: string,
  lessonRef: string,
): Promise<{ ok: true; total: number } | { ok: false; result: MarkResult }> {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.ownerId, ownerId), eq(courses.id, courseId)))
    .limit(1);
  if (!course) {
    return {
      ok: false,
      result: { ok: false, reason: "not-found", message: "Course not found." },
    };
  }

  const revision = await currentRevision(db, courseId);
  if (!revision) {
    return {
      ok: false,
      result: {
        ok: false,
        reason: "not-published",
        message: "This Course has not been published yet.",
      },
    };
  }

  const [outline] = await db
    .select()
    .from(outlines)
    .where(
      and(eq(outlines.courseId, courseId), eq(outlines.version, revision.outlineVersion)),
    )
    .limit(1);
  const planned = outline?.data.modules.flatMap((m) => m.lessons.map((l) => l.id)) ?? [];
  if (!planned.includes(lessonRef)) {
    return {
      ok: false,
      result: {
        ok: false,
        reason: "unknown-lesson",
        message: "That Lesson is not part of the Course as it is published.",
      },
    };
  }
  return { ok: true, total: planned.length };
}

/** Marks one Exercise done; the Lesson is complete from that moment on. */
export async function markLessonDone(
  db: Db,
  ownerId: string,
  courseId: string,
  lessonRef: string,
): Promise<MarkResult> {
  const checked = await ownedPublishedLesson(db, ownerId, courseId, lessonRef);
  if (!checked.ok) return checked.result;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(completions)
      .values({ courseId, lessonRef })
      .onConflictDoNothing()
      .returning();
    const doneAt = row?.doneAt ?? new Date();

    const doneCount = (
      await tx.select({ lessonRef: completions.lessonRef }).from(completions).where(eq(completions.courseId, courseId))
    ).length;
    const courseComplete = doneCount >= checked.total;

    await tx
      .update(courses)
      .set({
        completedAt: courseComplete ? (doneAt as Date) : null,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    return {
      ok: true as const,
      stamp: stampOf(doneAt),
      doneCount,
      total: checked.total,
      courseComplete,
    };
  });
}

/** Undoes one Exercise's completion; the Course stops being complete. */
export async function markLessonUndone(
  db: Db,
  ownerId: string,
  courseId: string,
  lessonRef: string,
): Promise<MarkResult> {
  const checked = await ownedPublishedLesson(db, ownerId, courseId, lessonRef);
  if (!checked.ok) return checked.result;

  return db.transaction(async (tx) => {
    await tx
      .delete(completions)
      .where(and(eq(completions.courseId, courseId), eq(completions.lessonRef, lessonRef)));

    const doneCount = (
      await tx.select({ lessonRef: completions.lessonRef }).from(completions).where(eq(completions.courseId, courseId))
    ).length;

    await tx
      .update(courses)
      .set({ completedAt: null, updatedAt: new Date() })
      .where(eq(courses.id, courseId));

    return {
      ok: true as const,
      stamp: "",
      doneCount,
      total: checked.total,
      courseComplete: false,
    };
  });
}

/** Every completion of the Course, keyed by its Outline Lesson id. */
export async function listCompletions(
  db: Db,
  courseId: string,
): Promise<Map<string, Date>> {
  const rows = await db
    .select()
    .from(completions)
    .where(eq(completions.courseId, courseId));
  return new Map(rows.map((r) => [r.lessonRef, r.doneAt]));
}
